/**
 * One team — rename, re-scope, re-point at numbers, delete.
 *
 *   PATCH  /api/teams/:id   → name | description | conversationScope | allowedNumberIds
 *   DELETE /api/teams/:id   → delete the team; its members SURVIVE, detached
 *
 * Same three-layer authorization as the collection route (see ./route.ts), and
 * the same tenant rule: `findFirst({ id, ownerId: uid })` is what makes a team
 * from another workspace indistinguishable from one that does not exist.
 *
 * Deleting a team never deletes people. TeamMember.teamId is onDelete:SetNull,
 * so its members fall back to the unassigned pool and to the historical
 * own_only isolation — a safe direction to fail (narrower, not wider).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiGate } from "@/lib/membership/gate";
import { getAuthContext } from "@/lib/auth";
import { auditCtx } from "@/lib/audit/log";
import { CONVERSATION_SCOPES, parseNumberIds } from "@/lib/teams/scope";

export const dynamic = "force-dynamic";

const db = prisma as any;

const PatchBody = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(200).optional(),
  conversationScope: z.enum(CONVERSATION_SCOPES as [string, ...string[]]).optional(),
  allowedNumberIds: z.array(z.string().min(1)).max(50).optional(),
});

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const g = await apiGate("multi_team", "team");
  if (g.response) return g.response;
  const uid = g.uid!;

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const body = parsed.data;

  try {
    const team = await db.team.findFirst({ where: { id: ctx.params.id, ownerId: uid } });
    if (!team) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const data: any = {};
    if (body.name !== undefined) {
      const dupe = await db.team.findFirst({
        where: { ownerId: uid, name: body.name, id: { not: team.id } },
      });
      if (dupe) return NextResponse.json({ error: "اسم الفريق مستخدم بالفعل" }, { status: 409 });
      data.name = body.name;
    }
    if (body.description !== undefined) data.description = body.description;
    if (body.conversationScope !== undefined) data.conversationScope = body.conversationScope;
    if (body.allowedNumberIds !== undefined) {
      // Re-verify ownership on every write — never trust ids from the body.
      const owned = body.allowedNumberIds.length
        ? (await db.whatsAppNumber.findMany({
            where: { userId: uid, id: { in: body.allowedNumberIds } },
            select: { id: true },
          })).map((n: { id: string }) => n.id)
        : [];
      data.allowedNumberIds = JSON.stringify(owned);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: true, team: { ...team, allowedNumberIds: parseNumberIds(team.allowedNumberIds) } });
    }

    const updated = await db.team.update({ where: { id: team.id }, data });

    void auditCtx(await getAuthContext(), "team.updated", {
      userId: uid,
      targetType: "team",
      targetId: team.id,
      metadata: {
        name: updated.name,
        from: { scope: team.conversationScope, numbers: parseNumberIds(team.allowedNumberIds).length },
        to: { scope: updated.conversationScope, numbers: parseNumberIds(updated.allowedNumberIds).length },
      },
      req,
    });

    return NextResponse.json({
      ok: true,
      team: { ...updated, allowedNumberIds: parseNumberIds(updated.allowedNumberIds) },
    });
  } catch (e) {
    console.error("[teams] update failed:", e);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  const g = await apiGate("multi_team", "team");
  if (g.response) return g.response;
  const uid = g.uid!;

  try {
    const team = await db.team.findFirst({
      where: { id: ctx.params.id, ownerId: uid },
      include: { members: { select: { id: true } } },
    });
    if (!team) return NextResponse.json({ error: "not_found" }, { status: 404 });

    await db.team.delete({ where: { id: team.id } });

    void auditCtx(await getAuthContext(), "team.deleted", {
      userId: uid,
      targetType: "team",
      targetId: team.id,
      metadata: { name: team.name, detachedMembers: team.members.length },
      req,
    });

    return NextResponse.json({ ok: true, detachedMembers: team.members.length });
  } catch (e) {
    console.error("[teams] delete failed:", e);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
