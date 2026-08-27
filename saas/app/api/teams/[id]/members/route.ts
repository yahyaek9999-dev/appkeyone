/**
 * Team membership + per-member isolation override.
 *
 *   POST   /api/teams/:id/members   → attach a member to this team, and
 *                                     optionally set their personal override
 *                                     (conversationScope / allowedNumberIds)
 *   DELETE /api/teams/:id/members?memberId=...
 *                                   → detach; the person and their login stay,
 *                                     they fall back to own_only
 *
 * This is the write path the two dead columns never had. Both are validated the
 * same way the team-level policy is: scope must be one of the three known
 * values, and every number id must belong to THIS workspace.
 *
 * TENANT ISOLATION is enforced on BOTH objects, not just the team: the member
 * is looked up with `ownerId: uid` as well, so an admin cannot pull a person
 * from another workspace into their team by guessing an id.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiGate } from "@/lib/membership/gate";
import { getAuthContext } from "@/lib/auth";
import { auditCtx } from "@/lib/audit/log";
import { CONVERSATION_SCOPES } from "@/lib/teams/scope";

export const dynamic = "force-dynamic";

const db = prisma as any;

const PostBody = z.object({
  memberId: z.string().min(1),
  /** "" clears the personal override and lets the team policy apply. */
  conversationScope: z.enum(["", ...CONVERSATION_SCOPES] as [string, ...string[]]).optional(),
  allowedNumberIds: z.array(z.string().min(1)).max(50).optional(),
});

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const g = await apiGate("multi_team", "team");
  if (g.response) return g.response;
  const uid = g.uid!;

  const parsed = PostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const { memberId, conversationScope, allowedNumberIds } = parsed.data;

  try {
    const team = await db.team.findFirst({ where: { id: ctx.params.id, ownerId: uid }, select: { id: true, name: true } });
    if (!team) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // Scoped by ownerId too — the member must live in the caller's workspace.
    const member = await db.teamMember.findFirst({
      where: { id: memberId, ownerId: uid },
      select: { id: true, email: true, teamId: true },
    });
    if (!member) return NextResponse.json({ error: "member_not_found" }, { status: 404 });

    const data: any = { teamId: team.id };
    if (conversationScope !== undefined) data.conversationScope = conversationScope;
    if (allowedNumberIds !== undefined) {
      const owned = allowedNumberIds.length
        ? (await db.whatsAppNumber.findMany({
            where: { userId: uid, id: { in: allowedNumberIds } },
            select: { id: true },
          })).map((n: { id: string }) => n.id)
        : [];
      data.allowedNumberIds = JSON.stringify(owned);
    }

    await db.teamMember.update({ where: { id: member.id }, data });

    void auditCtx(await getAuthContext(), "team.member_assigned", {
      userId: uid,
      targetType: "member",
      targetId: member.id,
      metadata: { email: member.email, team: team.name, fromTeamId: member.teamId, toTeamId: team.id },
      req,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[teams] assign member failed:", e);
    return NextResponse.json({ error: "assign_failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  const g = await apiGate("multi_team", "team");
  if (g.response) return g.response;
  const uid = g.uid!;

  const memberId = new URL(req.url).searchParams.get("memberId");
  if (!memberId) return NextResponse.json({ error: "missing_member" }, { status: 400 });

  try {
    const team = await db.team.findFirst({ where: { id: ctx.params.id, ownerId: uid }, select: { id: true, name: true } });
    if (!team) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const member = await db.teamMember.findFirst({
      where: { id: memberId, ownerId: uid, teamId: team.id },
      select: { id: true, email: true },
    });
    if (!member) return NextResponse.json({ error: "member_not_found" }, { status: 404 });

    // Detaching also clears the personal override: leaving a team must not
    // leave someone holding a wider scope than the team that granted it.
    await db.teamMember.update({
      where: { id: member.id },
      data: { teamId: null, conversationScope: "", allowedNumberIds: "[]" },
    });

    void auditCtx(await getAuthContext(), "team.member_unassigned", {
      userId: uid,
      targetType: "member",
      targetId: member.id,
      metadata: { email: member.email, team: team.name },
      req,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[teams] unassign member failed:", e);
    return NextResponse.json({ error: "unassign_failed" }, { status: 500 });
  }
}
