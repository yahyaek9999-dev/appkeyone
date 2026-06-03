/**
 * Team management API — owner manages workspace team members (TeamMember rows).
 *
 *   GET    /api/settings/team            → list members (+ owner not included)
 *   POST   /api/settings/team            → invite a member; returns an accept link
 *   PATCH  /api/settings/team            → change a member's role
 *   DELETE /api/settings/team?id=...     → remove a member
 *
 * All gated by requirePermission("team") (owner + admin role). Members log in
 * with their own credentials but operate inside the owner's workspace.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ASSIGNABLE_ROLES } from "@/lib/rbac";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const INVITE_TTL_DAYS = 7;

function sha256(v: string) {
  return createHash("sha256").update(v).digest("hex");
}

async function owner() {
  // Throws FORBIDDEN for non-team roles; returns the owner User.
  return requirePermission("team");
}

export async function GET() {
  let user;
  try { user = await owner(); }
  catch (e: any) { return NextResponse.json({ error: "forbidden" }, { status: e?.message === "UNAUTHORIZED" ? 401 : 403 }); }

  const members = await prisma.teamMember.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, status: true, invitedAt: true, acceptedAt: true, lastLoginAt: true },
  });
  return NextResponse.json({ ok: true, members });
}

const InviteBody = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  name: z.string().trim().max(80).optional(),
  role: z.enum(ASSIGNABLE_ROLES),
});

export async function POST(req: Request) {
  let user;
  try { user = await owner(); }
  catch (e: any) { return NextResponse.json({ error: "forbidden" }, { status: e?.message === "UNAUTHORIZED" ? 401 : 403 }); }

  const limited = enforceRateLimit(req, { name: "team-invite", identifier: user.id, ...RATE_LIMITS.api });
  if (limited) return limited;

  const parsed = InviteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const { email, name, role } = parsed.data;

  // Don't let an owner invite their own owner-email or a platform admin email.
  if (email === user.email.toLowerCase()) {
    return NextResponse.json({ error: "هذا هو بريد المالك" }, { status: 400 });
  }
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    return NextResponse.json({ error: "هذا البريد يملك حساباً مستقلاً بالفعل" }, { status: 409 });
  }
  const dupe = await prisma.teamMember.findUnique({ where: { ownerId_email: { ownerId: user.id, email } } as any });
  if (dupe) return NextResponse.json({ error: "هذا العضو مضاف بالفعل" }, { status: 409 });

  const rawToken = randomBytes(24).toString("base64url");
  const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const member = await prisma.teamMember.create({
    data: {
      ownerId: user.id,
      email,
      name: name || null,
      role,
      status: "invited",
      inviteTokenHash: sha256(rawToken),
      inviteExpiresAt,
    },
    select: { id: true, email: true, name: true, role: true, status: true },
  });

  const origin = new URL(req.url).origin;
  const acceptUrl = `${origin}/team/accept?token=${rawToken}`;

  return NextResponse.json({ ok: true, member, acceptUrl, expiresAt: inviteExpiresAt });
}

const PatchBody = z.object({
  id: z.string().min(1),
  role: z.enum(ASSIGNABLE_ROLES),
});

export async function PATCH(req: Request) {
  let user;
  try { user = await owner(); }
  catch (e: any) { return NextResponse.json({ error: "forbidden" }, { status: e?.message === "UNAUTHORIZED" ? 401 : 403 }); }

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const member = await prisma.teamMember.findFirst({ where: { id: parsed.data.id, ownerId: user.id }, select: { id: true } });
  if (!member) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.teamMember.update({ where: { id: member.id }, data: { role: parsed.data.role } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  let user;
  try { user = await owner(); }
  catch (e: any) { return NextResponse.json({ error: "forbidden" }, { status: e?.message === "UNAUTHORIZED" ? 401 : 403 }); }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const member = await prisma.teamMember.findFirst({ where: { id, ownerId: user.id }, select: { id: true } });
  if (!member) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.teamMember.delete({ where: { id: member.id } });
  return NextResponse.json({ ok: true });
}
