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
  const channel = url.searchParams.get("channel") || undefined;
  const take = Math.min(100, Math.max(1, Number(url.searchParams.get("take") || 50)));

  const where: any = { userId: user.id };
  if (status) where.status = status;
  if (channel) where.channel = channel;

  const items = await (prisma as any).commerceNotificationLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      integrationId: true,
      orderId: true,
      eventId: true,
      eventType: true,
      channel: true,
      provider: true,
      recipient: true,
      subject: true,
      status: true,
      attempts: true,
      error: true,
      sentAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, items });
}
