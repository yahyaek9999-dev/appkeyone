import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const integrationId = url.searchParams.get("integrationId") || undefined;
  const take = Math.min(100, Math.max(1, Number(url.searchParams.get("take") || 50)));

  const where: any = { userId: user.id };
  if (status) where.status = status;
  if (integrationId) where.integrationId = integrationId;

  const [items, failed] = await Promise.all([
    (prisma as any).commerceWebhookEvent.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take,
      select: {
        id: true,
        integrationId: true,
        source: true,
        eventType: true,
        externalEventId: true,
        externalOrderId: true,
        signatureOk: true,
        status: true,
        attempts: true,
        lastError: true,
        receivedAt: true,
        processedAt: true,
      },
    }),
    (prisma as any).commerceWebhookEvent.count({ where: { userId: user.id, status: "failed" } }).catch(() => 0),
  ]);

  return NextResponse.json({ ok: true, failed, items });
}
