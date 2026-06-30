// Customer-facing Meta center API (own tenant only).
//   GET  → connection eligibility + billing snapshot + phones + invoices.
//   POST { action: "refresh" } → re-derive own conversations from the message
//          ledger + recompute today's rollup (safe, read-from-own-data only).
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserIdForPermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getMetaBillingSnapshot,
  deriveConversationsFromMessages,
  rollupDay,
  runHealthCheck,
  listIncidents,
  getConnectionDiagnostics,
  runConnectionTest,
} from "@/lib/meta";
import { metaCloudAllowedForUser } from "@/lib/messaging/feature-flags";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getUserIdForPermission("billing");
  if (!userId) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const [snapshot, eligibility, invoices, bot] = await Promise.all([
    getMetaBillingSnapshot(userId),
    metaCloudAllowedForUser(userId),
    prisma.metaInvoice.findMany({ where: { userId }, orderBy: { period: "desc" }, take: 12 }),
    prisma.bot.findUnique({
      where: { userId },
      select: {
        connectionMode: true,
        metaPhoneNumberId: true,
        metaQualityRating: true,
        metaMessagingLimit: true,
        metaVerifiedAt: true,
      } as any,
    }) as any,
  ]);
  const [phones, incidents, diagnostics] = await Promise.all([
    prisma.metaPhone.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
    listIncidents({ userId, take: 50 }),
    getConnectionDiagnostics(userId),
  ]);

  return NextResponse.json({ ok: true, eligibility, snapshot, invoices, phones, incidents, diagnostics, bot });
}

const Body = z.object({ action: z.enum(["refresh", "health", "test"]) });

export async function POST(req: Request) {
  const userId = await getUserIdForPermission("billing");
  if (!userId) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  if (parsed.data.action === "health") {
    const res = await runHealthCheck(userId);
    return NextResponse.json({ ok: true, ...res });
  }
  if (parsed.data.action === "test") {
    const res = await runConnectionTest(userId);
    return NextResponse.json({ ok: true, ...res });
  }
  const derived = await deriveConversationsFromMessages(userId, 7);
  const today = new Date().toISOString().slice(0, 10);
  await rollupDay(userId, today);
  return NextResponse.json({ ok: true, ...derived });
}
