// Lost-Customer Recovery — candidate list.
//
// Reuses the existing intel detectors (lib/intel/*) — the SAME engines behind
// /dashboard/intel — and removes anything the merchant explicitly dismissed.
// Read-only. No sending happens here.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { detectLostCustomers } from "@/lib/intel/lost-customers";
import { detectFollowUpOps } from "@/lib/intel/follow-up-ops";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const now = new Date();
  const [lost, fup, dismissals] = await Promise.all([
    detectLostCustomers(uid, now),
    detectFollowUpOps(uid, now),
    prisma.recoveryDismissal.findMany({
      where: { userId: uid },
      select: { customerId: true, kind: true },
    }),
  ]);

  const dismissed = new Set(dismissals.map((d) => `${d.customerId}:${d.kind}`));
  const items = [...lost, ...fup]
    .filter((it) => !dismissed.has(`${it.customerId}:${it.kind}`))
    .sort((a, b) => b.urgency - a.urgency);

  return NextResponse.json({
    generatedAt: now.toISOString(),
    count: items.length,
    items,
  });
}
