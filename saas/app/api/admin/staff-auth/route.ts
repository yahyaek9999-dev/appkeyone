// POST /api/admin/staff-auth  → Admin staff member login
// POST /api/admin/staff-auth?action=invite → Create invite token for new staff
// POST /api/admin/staff-auth?action=setup  → Staff sets own password from invite token
import { NextResponse } from "next/server";
import { z } from "zod";
import { SignJWT } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

function authSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET not set");
    return new TextEncoder().encode("dev-secret-please-change-min-32-chars-long");
  }
  return new TextEncoder().encode(s);
}

const STAFF_COOKIE = "mse_staff_session";
const ALG = "HS256";
const SECURE_COOKIE = process.env.NODE_ENV === "production";

const LoginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
const InviteBody = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["super_admin", "admin", "sales", "support", "finance", "operations", "technical"]),
  permissions: z.array(z.string()).default([]),
});
const SetupBody = z.object({
  token: z.string().min(20),
  password: z.string().min(8).max(128),
});

async function createStaffSession(staffId: string, role: string, permissions: string[]): Promise<string> {
  return new SignJWT({ sid: staffId, role, permissions })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("8h")  // shorter than user sessions — 8h shift
    .sign(authSecret());
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // ── action=invite: super_admin creates invite for new staff ───────────────
  if (action === "invite") {
    try { await requireAdmin(); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }

    const parsed = InviteBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

    // Generate one-time invite token (raw, stored hashed)
    const rawToken = `inv_${crypto.randomUUID().replace(/-/g, "")}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const staff = await (prisma as any).staffMember.upsert({
      where: { email: parsed.data.email },
      update: {
        name: parsed.data.name,
        role: parsed.data.role,
        permissions: JSON.stringify(parsed.data.permissions),
        status: "invited",
        inviteToken: rawToken,
        inviteExpiresAt: expiresAt,
      },
      create: {
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        permissions: JSON.stringify(parsed.data.permissions),
        status: "invited",
        inviteToken: rawToken,
        inviteExpiresAt: expiresAt,
      },
    });

    // Return the raw token — caller must email it to the staff member
    // In production, wire this to your email provider
    return NextResponse.json({ ok: true, staffId: staff.id, inviteToken: rawToken, expiresAt });
  }

  // ── action=setup: staff sets password from invite token ───────────────────
  if (action === "setup") {
    const parsed = SetupBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

    const staff = await (prisma as any).staffMember.findUnique({
      where: { inviteToken: parsed.data.token },
    });

    if (!staff) return NextResponse.json({ error: "invalid_token" }, { status: 400 });
    if (staff.status === "suspended") return NextResponse.json({ error: "suspended" }, { status: 403 });
    if (staff.inviteExpiresAt && new Date(staff.inviteExpiresAt) < new Date()) {
      return NextResponse.json({ error: "token_expired" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await (prisma as any).staffMember.update({
      where: { id: staff.id },
      data: { passwordHash, status: "active", inviteToken: null, inviteExpiresAt: null },
    });

    // Issue session cookie
    const token = await createStaffSession(staff.id, staff.role, JSON.parse(staff.permissions || "[]"));
    cookies().set(STAFF_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: SECURE_COOKIE,
      path: "/admin",
      maxAge: 60 * 60 * 8, // 8 hours
    });

    return NextResponse.json({ ok: true, role: staff.role });
  }

  // ── default: login with email + password ──────────────────────────────────
  const parsed = LoginBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_credentials" }, { status: 401 });

  const staff = await (prisma as any).staffMember.findUnique({
    where: { email: parsed.data.email },
  });

  if (!staff || !staff.passwordHash) {
    return NextResponse.json({ error: "bad_credentials" }, { status: 401 });
  }
  if (staff.status === "suspended") {
    return NextResponse.json({ error: "account_suspended" }, { status: 403 });
  }

  const valid = await bcrypt.compare(parsed.data.password, staff.passwordHash);
  if (!valid) return NextResponse.json({ error: "bad_credentials" }, { status: 401 });

  // Update last login
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  await (prisma as any).staffMember.update({
    where: { id: staff.id },
    data: { lastLoginAt: new Date(), lastLoginIp: ip },
  });

  const token = await createStaffSession(staff.id, staff.role, JSON.parse(staff.permissions || "[]"));
  cookies().set(STAFF_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE_COOKIE,
    path: "/admin",
    maxAge: 60 * 60 * 8,
  });

  return NextResponse.json({ ok: true, role: staff.role, name: staff.name });
}
