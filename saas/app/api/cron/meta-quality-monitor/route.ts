/**
 * Meta quality + messaging limit monitor — Phase 4 cron.
 *
 * Pulls phone-number health from Graph API for every Meta-configured
 * merchant once an hour. Updates Bot.metaQualityRating and
 * Bot.metaMessagingLimit, and raises a WaComplianceAudit when the rating
 * drops to YELLOW or RED so the merchant sees it on the dashboard.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto-util";
import { getPhoneNumberHealth } from "@/lib/messaging/meta-api";
import { checkInternalSecret } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkInternalSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const bots = await prisma.bot.findMany({
    where: {
      metaPhoneNumberId: { not: null },
      metaAccessTokenEnc: { not: null },
    } as any,
    select: {
      userId: true,
      metaPhoneNumberId: true,
      metaAccessTokenEnc: true,
      metaQualityRating: true,
    } as any,
  }) as any[];

  const out: any[] = [];
  for (const b of bots) {
    let token = "";
    try { token = decryptSecret(b.metaAccessTokenEnc); } catch { /* ignore */ }
    if (!token) { out.push({ userId: b.userId, status: "no_token" }); continue; }

    const r = await getPhoneNumberHealth({ phoneNumberId: b.metaPhoneNumberId, token });
    if (!r.ok) {
      out.push({ userId: b.userId, status: "fetch_failed", error: r.errorDetail });
      continue;
    }
    const nextRating = r.data?.quality_rating || null;
    const nextTier = r.data?.messaging_limit_tier || null;

    await prisma.bot.update({
      where: { userId: b.userId },
      data: {
        metaQualityRating: nextRating,
        metaMessagingLimit: nextTier,
        ...(nextRating && !b.metaQualityRating ? { metaVerifiedAt: new Date() } : {}),
      } as any,
    }).catch(() => {});

    // Raise an audit ONLY on degradation (GREEN→YELLOW/RED, YELLOW→RED).
    const prev = b.metaQualityRating || "GREEN";
    const degraded = (prev === "GREEN" && (nextRating === "YELLOW" || nextRating === "RED"))
                  || (prev === "YELLOW" && nextRating === "RED");
    if (degraded) {
      await (prisma as any).waComplianceAudit.create({
        data: {
          userId: b.userId,
          provider: "meta_cloud",
          severity: nextRating === "RED" ? "critical" : "warn",
          category: "quality",
          action: "downgraded",
          title: `quality dropped: ${prev} → ${nextRating}`,
          detail: `messaging limit tier: ${nextTier || "unknown"}`,
        },
      }).catch(() => {});
    }
    out.push({ userId: b.userId, status: "ok", quality: nextRating, tier: nextTier });
  }

  return NextResponse.json({ ok: true, examined: bots.length, results: out });
}
