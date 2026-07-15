import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  try { await requireAdmin(); }
  catch (e) { return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) }); }

  const { userId } = params;
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) return NextResponse.json({ error: "لا يوجد اشتراك" }, { status: 404 });

  // Reset ALL usage counters (not just messages) so an admin "reset usage" action
  // actually unblocks the tenant across messages, AI requests, and broadcasts —
  // matching the rolling monthly reset in lib/membership/limits.ts.
  await prisma.subscription.update({
    where: { userId },
    data: {
      msgsUsed: 0,
      aiRequestsUsed: 0,
      broadcastsUsed: 0,
      usageResetAt: new Date(),
    } as any,
  });

  return NextResponse.json({ ok: true });
}
