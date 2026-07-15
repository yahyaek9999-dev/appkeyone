// Meta Enterprise — admin per-tenant control.
//   GET  → full Meta snapshot for one tenant (billing + tenant + phones + audit).
//   POST → action discriminator:
//            credit  { amountEgp, note? }   → grant/adjust wallet credit (finance)
//            settle                          → charge pending conversations (finance)
//            status  { status, reason? }     → lifecycle transition       (admin)
//            rollup  { day?, period? }       → recompute usage/invoice     (admin)
//            derive  { days? }               → derive conversations from WaMessage (admin)
// Reuses lib/meta + lib/wallet accounting (single-source balance).
import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requireFinanceAccess } from "@/lib/admin";
import { prisma } from "@/lib/db";
import {
  getMetaBillingSnapshot,
  grantMetaCredit,
  settlePendingConversations,
  setMetaStatus,
  rollupDay,
  rollupInvoice,
  deriveConversationsFromMessages,
  rotateMetaToken,
  resetMetaWebhook,
  upsertMetaPhone,
  transferMetaPhone,
  removeMetaPhone,
  runHealthCheck,
  runConnectionTest,
  getConnectionDiagnostics,
  META_TENANT_STATUSES,
} from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { userId: string } }) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
  }
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [snapshot, phones, audits, incidents, diagnostics] = await Promise.all([
    getMetaBillingSnapshot(params.userId),
    prisma.metaPhone.findMany({
      where: { userId: params.userId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
    prisma.metaAudit.findMany({
      where: { userId: params.userId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.metaIncident.findMany({
      where: { userId: params.userId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 30,
    }),
    getConnectionDiagnostics(params.userId),
  ]);

  return NextResponse.json({ ok: true, user, snapshot, phones, audits, incidents, diagnostics });
}

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("credit"),
    amountUsd: z.number(),
    note: z.string().max(300).optional(),
    idempotencyKey: z.string().max(120).optional(),
  }),
  z.object({ action: z.literal("settle") }),
  z.object({
    action: z.literal("status"),
    status: z.enum(META_TENANT_STATUSES),
    reason: z.string().max(300).optional(),
  }),
  z.object({
    action: z.literal("rollup"),
    day: z.string().optional(),
    period: z.string().optional(),
  }),
  z.object({ action: z.literal("derive"), days: z.number().int().min(1).max(90).optional() }),
  z.object({ action: z.literal("rotate_token"), token: z.string().min(10) }),
  z.object({ action: z.literal("reset_webhook"), verifyToken: z.string().min(8).optional() }),
  z.object({
    action: z.literal("add_phone"),
    phoneNumberId: z.string().min(1),
    wabaId: z.string().optional(),
    displayPhone: z.string().optional(),
    isPrimary: z.boolean().optional(),
    token: z.string().optional(),
  }),
  z.object({ action: z.literal("remove_phone"), phoneId: z.string().min(1) }),
  z.object({
    action: z.literal("transfer_phone"),
    phoneId: z.string().min(1),
    toUserId: z.string().min(1),
  }),
  z.object({ action: z.literal("health") }),
  z.object({ action: z.literal("connection_test") }),
]);

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const body = parsed.data;
  const userId = params.userId;

  // Finance may credit + settle (money ops). Everything else is admin-only.
  const needsAdmin = body.action !== "credit" && body.action !== "settle";
  let actor;
  try {
    actor = needsAdmin ? await requireAdmin() : await requireFinanceAccess();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
  }

  const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (body.action === "credit") {
    const res = await grantMetaCredit(userId, body.amountUsd, {
      actorId: actor.email,
      note: body.note,
      idempotencyKey: body.idempotencyKey,
    });
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
    return NextResponse.json(res);
  }
  if (body.action === "settle") {
    const res = await settlePendingConversations(userId);
    return NextResponse.json({ ok: true, ...res });
  }
  if (body.action === "status") {
    const res = await setMetaStatus(userId, body.status, {
      actorId: actor.email,
      actorRole: "admin",
      reason: body.reason,
    });
    return NextResponse.json(res);
  }
  if (body.action === "rollup") {
    const day = body.day ?? new Date().toISOString().slice(0, 10);
    const period = body.period ?? day.slice(0, 7);
    const [dayRow, invoice] = await Promise.all([
      rollupDay(userId, day),
      rollupInvoice(userId, period),
    ]);
    return NextResponse.json({ ok: true, day: dayRow, invoice });
  }
  if (body.action === "derive") {
    const res = await deriveConversationsFromMessages(userId, body.days ?? 7);
    return NextResponse.json({ ok: true, ...res });
  }
  if (body.action === "rotate_token") {
    const res = await rotateMetaToken(userId, body.token, { actorId: actor.email });
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
    return NextResponse.json(res);
  }
  if (body.action === "reset_webhook") {
    const res = await resetMetaWebhook(userId, body.verifyToken, { actorId: actor.email });
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
    return NextResponse.json(res);
  }
  if (body.action === "add_phone") {
    const res = await upsertMetaPhone(
      userId,
      {
        phoneNumberId: body.phoneNumberId,
        wabaId: body.wabaId,
        displayPhone: body.displayPhone,
        isPrimary: body.isPrimary,
        accessTokenPlain: body.token,
      },
      { actorId: actor.email },
    );
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
    return NextResponse.json(res);
  }
  if (body.action === "remove_phone") {
    const res = await removeMetaPhone(body.phoneId, { actorId: actor.email });
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
    return NextResponse.json(res);
  }
  if (body.action === "health") {
    const res = await runHealthCheck(userId);
    return NextResponse.json({ ok: true, ...res });
  }
  if (body.action === "connection_test") {
    const res = await runConnectionTest(userId);
    return NextResponse.json({ ok: true, ...res });
  }
  // transfer_phone
  const res = await transferMetaPhone(body.phoneId, body.toUserId, { actorId: actor.email });
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
  return NextResponse.json(res);
}
