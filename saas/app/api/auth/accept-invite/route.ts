/**
 * Accept a team invite — set the member's password and activate the account.
 *
 *   POST /api/auth/accept-invite  { token, password }
 *
 * Validates the raw invite token against the stored sha256 hash + expiry,
 * sets passwordHash, flips status → "active". The member can then log in via
 * /api/auth/login (team-member fallback path).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
  name: z.string().trim().max(80).optional(),
});

function sha256(v: string) {
  return createHash("sha256").update(v).digest("hex");
}

export async function POST(req: Request) {
  const blocked = enforceRateLimit(req, { name: "accept-invite", ...RATE_LIMITS.auth });
  if (blocked) return blocked;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "تأكد من الرابط وكلمة مرور لا تقل عن 8 أحرف" }, { status: 400 });
  }

  const tokenHash = sha256(parsed.data.token);
  const member = await prisma.teamMember.findUnique({ where: { inviteTokenHash: tokenHash } });

  if (!member || member.status === "disabled") {
    return NextResponse.json({ error: "رابط الدعوة غير صالح" }, { status: 400 });
  }
  if (member.status === "active") {
    return NextResponse.json({ error: "تم تفعيل هذه الدعوة من قبل. سجّل الدخول مباشرة." }, { status: 409 });
  }
  if (member.inviteExpiresAt && member.inviteExpiresAt < new Date()) {
    return NextResponse.json({ error: "انتهت صلاحية رابط الدعوة. اطلب دعوة جديدة." }, { status: 410 });
  }

  await prisma.teamMember.update({
    where: { id: member.id },
    data: {
      passwordHash: await hashPassword(parsed.data.password),
      name: parsed.data.name?.trim() || member.name,
      status: "active",
      acceptedAt: new Date(),
      inviteTokenHash: null,
      inviteExpiresAt: null,
    },
  });

  return NextResponse.json({ ok: true, email: member.email, redirectTo: "/login" });
}
