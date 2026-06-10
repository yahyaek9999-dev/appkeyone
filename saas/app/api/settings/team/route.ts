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
import { requirePermission, getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ASSIGNABLE_ROLES } from "@/lib/rbac";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getEntitlements } from "@/lib/membership/entitlements";
import { auditCtx } from "@/lib/audit/log";

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

  // Only the workspace OWNER may create/assign the "admin" role. A workspace
  // admin holds the "team" permission, but letting them mint more admins is a
  // lateral privilege-escalation vector. Lower roles remain admin-manageable.
  if (role === "admin") {
    const ctx = await getAuthContext();
    if (!ctx?.isOwner) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Enforce the plan's team-seat limit for enforced (k_*) plans. Non-regressive:
  // legacy-slug active subscribers have enforce=false and unlimited plans have
  // limits.team===0, so neither is affected.
  try {
    const ent = await getEntitlements(user.id);
    if (ent.enforce && ent.limits.team > 0) {
      const current = await prisma.teamMember.count({
        where: { ownerId: user.id, status: { in: ["active", "invited"] } },
      });
      if (current >= ent.limits.team) {
        return NextResponse.json({ error: "seat_limit_reached", limit: ent.limits.team }, { status: 402 });
      }
    }
  } catch {
    // fail-open on gating errors — never block team management on our own bug.
  }

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

  void auditCtx(await getAuthContext(), "team.member_invited", {
    userId: user.id,
    targetType: "member",
    targetId: member.id,
    metadata: { email, role },
    req,
  });

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

  const member = await prisma.teamMember.findFirst({ where: { id: parsed.data.id, ownerId: user.id }, select: { id: true, role: true } });
  if (!member) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Promoting/demoting to or from "admin" is owner-only (see POST). A workspace
  // admin must not be able to escalate a peer (or themselves) to admin.
  if (parsed.data.role === "admin" || member.role === "admin") {
    const ctx = await getAuthContext();
    if (!ctx?.isOwner) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await prisma.teamMember.update({ where: { id: member.id }, data: { role: parsed.data.role } });

  void auditCtx(await getAuthContext(), "team.role_changed", {
    userId: user.id,
    targetType: "member",
    targetId: member.id,
    metadata: { from: member.role, to: parsed.data.role },
    req,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  let user;
  try { user = await owner(); }
  catch (e: any) { return NextResponse.json({ error: "forbidden" }, { status: e?.message === "UNAUTHORIZED" ? 401 : 403 }); }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const member = await prisma.teamMember.findFirst({ where: { id, ownerId: user.id }, select: { id: true, email: true, role: true } });
  if (!member) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.teamMember.delete({ where: { id: member.id } });

  void auditCtx(await getAuthContext(), "team.member_removed", {
    userId: user.id,
    targetType: "member",
    targetId: member.id,
    metadata: { email: member.email, role: member.role },
    req,
  });

  return NextResponse.json({ ok: true });
}
