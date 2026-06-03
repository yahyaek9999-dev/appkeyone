// Demo mode data API — returns in-memory synthetic data only. Never reads real
// customer/order tables. Never writes anything. Never sends messages.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  DEMO_CUSTOMERS,
  DEMO_ORDERS,
  DEMO_NBA,
  DEMO_STATS,
  getDemoConversation,
} from "@/lib/demo/synthetic";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "overview";
  const customerId = searchParams.get("customerId");

  if (type === "conversation" && customerId) {
    const conv = getDemoConversation(customerId);
    if (!conv) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(conv);
  }

  if (type === "nba" && customerId) {
    const nba = DEMO_NBA[customerId];
    if (!nba) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(nba);
  }

  return NextResponse.json({
    customers: DEMO_CUSTOMERS,
    orders: DEMO_ORDERS,
    nba: DEMO_NBA,
    stats: DEMO_STATS,
    demoMode: true,
  });
}
