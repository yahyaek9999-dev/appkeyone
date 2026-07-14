/**
 * AI catalog-mismatch sweep — hourly cron.
 *
 * Scans assistant-role messages sent in the last hour for price mentions
 * that don't match any active product in that tenant's catalog, and writes
 * a SafetyAudit row (surfaced on the existing /dashboard/safety feed —
 * app/api/safety/state/route.ts already reads any-category SafetyAudit
 * rows, no UI change needed) for merchant review. Read-only over Message/
 * Product; never touches the WhatsApp send pipeline or Message.flagged
 * (which is order/payment-detection-specific — see app/api/whatsapp/incoming
 * for its real meaning, deliberately not reused here to avoid conflating
 * the two concerns).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkInternalSecret } from "@/lib/internal-auth";
import { findCatalogMismatches } from "@/lib/ai/catalog-guard";

export const dynamic = "force-dynamic";

const LOOKBACK_MS = 65 * 60 * 1000; // hourly cron + 5min buffer against drift

export async function POST(req: Request) {
  if (!checkInternalSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - LOOKBACK_MS);

  const messages = await prisma.message.findMany({
    where: { role: "assistant", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      content: true,
      createdAt: true,
      conversation: { select: { customer: { select: { userId: true } } } },
    },
  });

  // Group by tenant so each tenant's catalog is loaded once, not per-message.
  const byUser = new Map<string, { id: string; content: string }[]>();
  for (const m of messages) {
    const uid = m.conversation?.customer?.userId;
    if (!uid) continue;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push({ id: m.id, content: m.content });
  }

  let flagged = 0;
  let scanned = 0;

  for (const [userId, msgs] of byUser) {
    const products = await prisma.product.findMany({
      where: { userId, active: true },
      select: { price: true, compareAtPrice: true },
    });
    if (products.length === 0) continue; // nothing to compare against for this tenant
    const knownPrices: number[] = [];
    for (const p of products) {
      knownPrices.push(p.price);
      if (p.compareAtPrice != null) knownPrices.push(p.compareAtPrice);
    }

    for (const msg of msgs) {
      scanned++;
      const mismatches = findCatalogMismatches(msg.content, knownPrices);
      if (mismatches.length === 0) continue;

      // Dedup against a prior run re-scanning the same message inside the
      // lookback overlap window — cheap existence check keyed by message id.
      const already = await (prisma as any).safetyAudit.findFirst({
        where: { userId, category: "ai_catalog_mismatch", payload: { contains: msg.id } },
        select: { id: true },
      });
      if (already) continue;

      await (prisma as any).safetyAudit.create({
        data: {
          userId,
          level: "warn",
          category: "ai_catalog_mismatch",
          title: "رد الذكاء الاصطناعي ذكر سعر غير موجود بالكتالوج",
          detail: mismatches.map((m) => m.reason).join(" · "),
          payload: JSON.stringify({ messageId: msg.id, mismatches }),
        },
      });
      flagged++;
    }
  }

  return NextResponse.json({ ok: true, scanned, flagged, tenants: byUser.size });
}
