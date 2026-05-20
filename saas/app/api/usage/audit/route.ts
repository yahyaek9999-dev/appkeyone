import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildDailyUsageSnapshot, verifyUsageAgainstLedger } from "@/lib/usage-ledger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const url = new URL(req.url);
  const day = url.searchParams.get("day") || new Date().toISOString().slice(0, 10);
  const [verification, snapshot, recent] = await Promise.all([
    verifyUsageAgainstLedger(user.id),
    buildDailyUsageSnapshot(user.id, day),
    (prisma as any).usageLedger.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }).catch(() => []),
  ]);
  return NextResponse.json({ ok: true, verification, snapshot, recent });
}
