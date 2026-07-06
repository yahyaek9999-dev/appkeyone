/**
 * POST /api/wallet/calculator — estimate Meta conversation cost for a scenario.
 * Body: { lines: [{ country?: string, category: MetaCategory, conversations: number }] }
 * Returns per-line + total charged cost (what KEYONE bills the tenant). Owner-only.
 */
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { loadRateCard, META_CATEGORIES, type MetaCategory } from "@/lib/wallet/meta-rates";
import { roundUsd } from "@/lib/wallet/money";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const uid = await getUserIdForPermission("billing");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const rawLines: any[] = Array.isArray(body.lines) ? body.lines.slice(0, 50) : [];

  const resolver = await loadRateCard();
  let totalCharged = 0;
  let totalConversations = 0;
  const lines = rawLines.map((l) => {
    const category: MetaCategory = META_CATEGORIES.includes(l.category) ? l.category : "marketing";
    const country = String(l.country || "*").toUpperCase();
    const conversations = Math.max(0, Math.min(10_000_000, Math.round(Number(l.conversations) || 0)));
    const rate = resolver(country, category);
    const charged = roundUsd(rate.rateUsd * conversations);
    totalCharged = roundUsd(totalCharged + charged);
    totalConversations += conversations;
    return { country, category, conversations, rateUsd: rate.rateUsd, chargedUsd: charged };
  });

  return NextResponse.json({ ok: true, lines, totalConversations, totalChargedUsd: totalCharged });
}
