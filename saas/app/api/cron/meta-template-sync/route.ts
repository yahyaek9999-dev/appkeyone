/**
 * Meta template registry sync — Phase 2 cron.
 *
 * For each merchant with Meta Cloud configured, lists all message templates
 * on their WABA via the Graph API and upserts them into `WaTemplate`.
 *
 * Run cadence: every 30 minutes. Cheap (one call per merchant). The
 * processed templates are needed before `sendTemplate` will return ok=true
 * because we enforce status=APPROVED in the provider layer.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto-util";
import { listTemplates } from "@/lib/messaging/meta-api";
import { checkInternalSecret } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkInternalSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const bots = await prisma.bot.findMany({
    where: {
      // Only merchants who finished Meta onboarding.
      metaBusinessAccountId: { not: null },
      metaAccessTokenEnc: { not: null },
    } as any,
    select: {
      userId: true,
      metaBusinessAccountId: true,
      metaAccessTokenEnc: true,
    } as any,
  }) as any[];

  const out: any[] = [];
  for (const b of bots) {
    let token = "";
    try { token = decryptSecret(b.metaAccessTokenEnc); } catch { /* ignore */ }
    if (!token) { out.push({ userId: b.userId, status: "no_token" }); continue; }

    const r = await listTemplates({ wabaId: b.metaBusinessAccountId, token });
    if (!r.ok) {
      out.push({ userId: b.userId, status: "fetch_failed", error: r.errorDetail });
      continue;
    }
    const templates = r.data?.data || [];
    let upserts = 0;
    for (const t of templates) {
      await (prisma as any).waTemplate.upsert({
        where: { userId_name_language: { userId: b.userId, name: t.name, language: t.language } },
        update: {
          category: t.category,
          status: t.status,
          components: JSON.stringify(t.components || []),
          qualityScore: t.quality_score?.score || null,
          rejectReason: t.rejected_reason || null,
          lastSyncedAt: new Date(),
        },
        create: {
          userId: b.userId,
          name: t.name,
          language: t.language,
          category: t.category,
          status: t.status,
          components: JSON.stringify(t.components || []),
          qualityScore: t.quality_score?.score || null,
          rejectReason: t.rejected_reason || null,
        },
      }).catch(() => {});
      upserts++;
    }
    out.push({ userId: b.userId, status: "ok", count: upserts });
  }

  return NextResponse.json({ ok: true, examined: bots.length, results: out });
}
