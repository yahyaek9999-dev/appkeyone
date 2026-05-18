// Sales Intelligence — unified read endpoint.
//
// Returns all four detector lists in one round-trip so the merchant page can
// render its tabs without race conditions. All work is read-only and capped
// in each detector (top 50 per kind), so a single call stays well below 1s
// even for active merchants.

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { detectLostCustomers } from "@/lib/intel/lost-customers";
import { detectUpsell } from "@/lib/intel/upsell";
import { detectHotLeads } from "@/lib/intel/hot-leads";
import { detectFollowUpOps } from "@/lib/intel/follow-up-ops";
import type { IntelResponse } from "@/lib/intel/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const now = new Date();
  const [lost, upsell, hot, fup] = await Promise.all([
    detectLostCustomers(uid, now),
    detectUpsell(uid, now),
    detectHotLeads(uid, now),
    detectFollowUpOps(uid, now),
  ]);

  const body: IntelResponse = {
    generatedAt: now.toISOString(),
    counts: {
      lost_customer: lost.length,
      upsell: upsell.length,
      hot_lead: hot.length,
      follow_up_op: fup.length,
    },
    items: {
      lost_customer: lost,
      upsell,
      hot_lead: hot,
      follow_up_op: fup,
    },
  };
  return NextResponse.json(body);
}
