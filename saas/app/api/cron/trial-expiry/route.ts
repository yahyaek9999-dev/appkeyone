/**
 * Trial expiry sweep (Area 3). Flips Subscription rows whose trial window has
 * passed from status="trial" to "expired" so admin views stay accurate. Feature
 * lockdown already happens on-read via getActivationState(), so this is cleanup
 * — safe to run hourly, idempotent, and a no-op when there are no expired trials.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkInternalSecret } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkInternalSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const result = await prisma.subscription.updateMany({
    where: { status: "trial", trialEndsAt: { lt: now } } as any,
    data: { status: "expired" },
  });

  return NextResponse.json({ ok: true, expired: result.count });
}
