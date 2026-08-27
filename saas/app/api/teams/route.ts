/**
 * Teams API — the Enterprise `multi_team` capability.
 *
 *   GET  /api/teams   → every team in THIS workspace, with its members
 *   POST /api/teams   → create a team
 *
 * AUTHORIZATION, in this order, all of it server-side:
 *   apiGate("multi_team", "team")
 *     → 401 no session
 *     → 403 principal lacks the "team" permission (sales/support/viewer)
 *     → 402 the plan does not include multi_team
 *   then every query is scoped `ownerId: uid`, where uid is the OWNER's User.id
 *   resolved from the session — never from the request body or a query param.
 *   That is the tenant boundary: a team id belonging to another workspace
 *   simply does not match, so it 404s rather than leaking its existence.
 *
 * Note the gate takes the OWNER id even for a member session (getAuthContext
 * returns the owner row), so an admin member manages their own workspace's
 * teams and no one else's.
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

const MEMBER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  conversationScope: true,
  allowedNumberIds: true,
};

export async function GET() {
  const g = await apiGate("multi_team", "team");
  if (g.response) return g.response;
  const uid = g.uid!;

  try {
    const [teams, unassigned, numbers] = await Promise.all([
      db.team.findMany({
        where: { ownerId: uid },
        orderBy: { createdAt: "asc" },
        include: { members: { select: MEMBER_SELECT, orderBy: { createdAt: "asc" } } },
      }),
      db.teamMember.findMany({
        where: { ownerId: uid, teamId: null },
        select: MEMBER_SELECT,
        orderBy: { createdAt: "asc" },
      }),
      db.whatsAppNumber.findMany({
        where: { userId: uid },
        select: { id: true, displayName: true, phone: true },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      teams: teams.map((t: any) => ({
        ...t,
        allowedNumberIds: parseNumberIds(t.allowedNumberIds),
      })),
      unassigned,
      numbers,
    });
  } catch (e) {
    // The table is missing only when the schema push has not run on this host.
    // Say so plainly instead of 500-ing — the UI renders a migration notice.
    console.error("[teams] list failed:", e);
    return NextResponse.json({ ok: true, teams: [], unassigned: [], numbers: [], pending: true });
  }
}

const CreateBody = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).optional(),
  conversationScope: z.enum(CONVERSATION_SCOPES as [string, ...string[]]).optional(),
  allowedNumberIds: z.array(z.string().min(1)).max(50).optional(),
});

export async function POST(req: Request) {
  const g = await apiGate("multi_team", "team");
  if (g.response) return g.response;
  const uid = g.uid!;

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const { name, description, conversationScope, allowedNumberIds } = parsed.data;

  try {
    const dupe = await db.team.findFirst({ where: { ownerId: uid, name } });
    if (dupe) return NextResponse.json({ error: "اسم الفريق مستخدم بالفعل" }, { status: 409 });

    // Only numbers that belong to THIS workspace may be granted — otherwise a
    // crafted body could pin a team to another tenant's number id.
    const owned = allowedNumberIds?.length
      ? (await db.whatsAppNumber.findMany({
          where: { userId: uid, id: { in: allowedNumberIds } },
          select: { id: true },
        })).map((n: { id: string }) => n.id)
      : [];

    const team = await db.team.create({
      data: {
        ownerId: uid,
        name,
        description: description || "",
        conversationScope: conversationScope || "team",
        allowedNumberIds: JSON.stringify(owned),
      },
      include: { members: { select: MEMBER_SELECT } },
    });

    void auditCtx(await getAuthContext(), "team.created", {
      userId: uid,
      targetType: "team",
      targetId: team.id,
      metadata: { name, conversationScope: team.conversationScope },
      req,
    });

    return NextResponse.json({ ok: true, team: { ...team, allowedNumberIds: owned } });
  } catch (e) {
    console.error("[teams] create failed:", e);
    return NextResponse.json({ error: "pending_migration", pending: true }, { status: 503 });
  }
}
