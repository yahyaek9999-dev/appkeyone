import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession, createMemberSession } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Precomputed hash used to burn ~equal bcrypt time on unknown-email logins so
// response latency can't be used to enumerate which emails are registered.
const DUMMY_HASH = bcrypt.hashSync("timing-equalization-placeholder", 10);

// Per-email failure counter (in addition to the per-IP rate limit). The per-IP
// limit alone does not stop DISTRIBUTED credential stuffing (one attempt per IP
// from a botnet against a single email). Key on a hash of the email so no PII
// sits in memory. Resets on the rolling window or on a successful login.
const emailFailStore = new Map<string, { count: number; resetAt: number }>();
const EMAIL_FAIL_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_FAIL_MAX = 20;

// GC: prune expired entries so a credential-stuffing attack can't fill this Map
// indefinitely. Runs every EMAIL_FAIL_WINDOW_MS (matches the window size).
const _emailFailGcTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of emailFailStore) if (v.resetAt < now) emailFailStore.delete(k);
}, EMAIL_FAIL_WINDOW_MS);
if (typeof _emailFailGcTimer.unref === "function") _emailFailGcTimer.unref();

function emailFailKey(email: string) {
  return "loginfail:" + createHash("sha256").update(email).digest("hex");
}
function isEmailLocked(email: string): boolean {
  const e = emailFailStore.get(emailFailKey(email));
  return !!e && e.resetAt > Date.now() && e.count >= EMAIL_FAIL_MAX;
}
function recordEmailFail(email: string): void {
  const key = emailFailKey(email);
  const now = Date.now();
  const e = emailFailStore.get(key);
  if (!e || e.resetAt < now) {
    emailFailStore.set(key, { count: 1, resetAt: now + EMAIL_FAIL_WINDOW_MS });
  } else {
    e.count += 1;
  }
}
function clearEmailFail(email: string): void {
  emailFailStore.delete(emailFailKey(email));
}

export async function POST(req: Request) {
  const blocked = enforceRateLimit(req, { name: "login", ...RATE_LIMITS.auth });
  if (blocked) return blocked;
  let json: any;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "JSON غير صالح" }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();

  // Distributed-stuffing guard: too many recent failures for this email → 429,
  // regardless of source IP. Generic body avoids confirming account existence.
  if (isEmailLocked(email)) {
    return NextResponse.json(
      { error: "محاولات كثيرة. حاول بعد قليل." },
      { status: 429 },
    );
  }

  // 1) Owner account login (the original path).
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
      recordEmailFail(email);
      return NextResponse.json({ error: "بريد أو كلمة مرور خاطئة" }, { status: 401 });
    }
    // Approval gate for self-service signups awaiting admin activation.
    if ((user as any).approvalStatus === "pending") {
      return NextResponse.json({ error: "حسابك قيد المراجعة. سيتم تفعيله قريباً." }, { status: 403 });
    }
    if ((user as any).approvalStatus === "rejected") {
      return NextResponse.json({ error: "تعذّر تفعيل هذا الحساب. تواصل مع الدعم." }, { status: 403 });
    }
    // Suspended accounts cannot obtain a new session (getAuthContext also rejects
    // any session they still hold).
    if ((user as any).suspended) {
      return NextResponse.json({ error: "هذا الحساب موقوف. تواصل مع الدعم." }, { status: 403 });
    }
    clearEmailFail(email);
    await createSession(user.id, (user as any).passwordChangedAt);
    const role = (user as any).role || "user";
    return NextResponse.json({
      ok: true,
      role,
      redirectTo: role === "admin" ? "/admin" : role === "finance" ? "/finance/payments" : "/dashboard",
    });
  }

  // 2) Team-member login fallback. Members authenticate with their own
  //    credentials but operate inside the owner's workspace.
  const member = await prisma.teamMember.findFirst({
    where: { email, status: "active", passwordHash: { not: null } },
  });
  if (member && member.passwordHash && (await verifyPassword(parsed.data.password, member.passwordHash))) {
    clearEmailFail(email);
    await createMemberSession(member.id);
    await prisma.teamMember.update({
      where: { id: member.id },
      data: { lastLoginAt: new Date() },
    }).catch(() => {});
    return NextResponse.json({ ok: true, role: member.role, redirectTo: "/dashboard" });
  }

  // No bcrypt ran above only when the email matched no owner and no member with
  // a password — equalize timing to avoid leaking account existence.
  if (!user && (!member || !member.passwordHash)) {
    await verifyPassword(parsed.data.password, DUMMY_HASH);
  }

  recordEmailFail(email);
  return NextResponse.json({ error: "بريد أو كلمة مرور خاطئة" }, { status: 401 });
}
