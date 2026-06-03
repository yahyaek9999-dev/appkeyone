import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: { id: string } }) {
  let user;
  try { user = await requirePermission("settings"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const limited = enforceRateLimit(req, { name: "commerce-integration-sync", identifier: user.id, ...RATE_LIMITS.api });
  if (limited) return limited;

  const integration = await (prisma as any).commerceIntegration.findFirst({
    where: { id: ctx.params.id, userId: user.id },
    select: { id: true, userId: true, platform: true, storeUrl: true, connectionStatus: true },
  });
  if (!integration) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await (prisma as any).commerceIntegration.update({
    where: { id: integration.id },
    data: { lastSyncStatus: "syncing", lastSyncAt: new Date() },
  }).catch(() => {});

  try {
    const events = await (prisma as any).commerceWebhookEvent.findMany({
      where: { integrationId: integration.id, status: "processed" },
      orderBy: { receivedAt: "desc" },
      take: 10,
      select: { id: true, eventType: true, externalOrderId: true, receivedAt: true },
    });

    await (prisma as any).commerceIntegration.update({
      where: { id: integration.id },
      data: { lastSyncStatus: "success", lastSyncError: null },
    }).catch(() => {});

    return NextResponse.json({ ok: true, synced: events.length, events });
  } catch (err: any) {
    await (prisma as any).commerceIntegration.update({
      where: { id: integration.id },
      data: { lastSyncStatus: "failed", lastSyncError: err.message || "sync_error" },
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: "sync_failed" }, { status: 500 });
  }
}
