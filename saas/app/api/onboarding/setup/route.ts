import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserForPermission } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { buildPersonaPack, type BusinessType, type ToneKey } from "@/lib/persona-packs";
import { importKnowledge } from "@/lib/knowledge-importer";
import { invalidateKnowledgeCache } from "@/lib/kb-cache";
import { recordMilestone } from "@/lib/activation/track";
import { resolveVertical } from "@/lib/modules";

const VALID_BUSINESS: BusinessType[] = ["fashion","beauty","electronics","food","services","general"];
const VALID_TONE: ToneKey[] = ["warm","professional","playful","premium"];

export async function POST(req: Request) {
  const user = await getUserForPermission("settings");
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = enforceRateLimit(req, { name: "onboarding-setup", identifier: user.id, ...RATE_LIMITS.api });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const brand        = String(body.brand || "").trim().slice(0, 60);
  const businessType = VALID_BUSINESS.includes(body.businessType) ? body.businessType : "general";
  // Workspace vertical (Store/Restaurant/Software/…). Tolerant → defaults to Store.
  const vertical     = resolveVertical(body.vertical);
  const tone         = VALID_TONE.includes(body.tone) ? body.tone : "warm";
  const notifyPhone  = typeof body.notifyPhone === "string" ? body.notifyPhone.trim().slice(0, 30) : "";
  const importedText = typeof body.importedText === "string" ? body.importedText : "";

  if (!brand) return NextResponse.json({ error: "brand_required" }, { status: 400 });

  // 1) Build the persona pack (zero LLM cost)
  const pack = buildPersonaPack(businessType as BusinessType, brand, tone as ToneKey);

  // 2) Parse imported text (optional)
  const imported = importedText ? importKnowledge(importedText) : { documents: [], quickReplies: [], productLines: [] };

  // 3) Upsert the Bot row
  const bot = await prisma.bot.upsert({
    where: { userId: user.id },
    update: {
      name: brand,
      persona: pack.persona,
      systemPrompt: pack.systemPrompt,
      welcomeMessage: pack.welcomeMessage,
      notifyPhone: notifyPhone || null,
      persuasionEnabled: pack.defaults.persuasionEnabled,
      negotiationEnabled: pack.defaults.negotiationEnabled,
      negotiationFloorPct: pack.defaults.negotiationFloorPct,
      humanizeReplies: pack.defaults.humanizeReplies,
      dynamicEmojis: pack.defaults.dynamicEmojis,
      replyVariations: pack.defaults.replyVariations,
    },
    create: {
      userId: user.id,
      name: brand,
      persona: pack.persona,
      systemPrompt: pack.systemPrompt,
      welcomeMessage: pack.welcomeMessage,
      notifyPhone: notifyPhone || null,
      persuasionEnabled: pack.defaults.persuasionEnabled,
      negotiationEnabled: pack.defaults.negotiationEnabled,
      negotiationFloorPct: pack.defaults.negotiationFloorPct,
      humanizeReplies: pack.defaults.humanizeReplies,
      dynamicEmojis: pack.defaults.dynamicEmojis,
      replyVariations: pack.defaults.replyVariations,
    },
  });

  // 3b) Persist the chosen workspace vertical to BusinessProfile (additive).
  //     Drives the module map (sidebar/KPIs/readiness/AI) in lib/modules.ts.
  //     A missing businessType still resolves to Store at read time.
  await prisma.businessProfile.upsert({
    where: { userId: user.id },
    update: { businessType: vertical },
    create: { userId: user.id, businessType: vertical },
  });

  // 4) Seed Documents (persona pack first, then imported)
  const allDocs = [
    ...pack.knowledge,
    ...imported.documents,
  ];
  // Add product lines as a single document
  if (imported.productLines.length) {
    const lines = imported.productLines
      .map((p) => `${p.name} — ${p.price ? p.price + " جنيه" : ""}`.trim())
      .join("\n");
    allDocs.push({ title: "المنتجات والأسعار", content: lines });
  }
  if (allDocs.length) {
    await prisma.$transaction(
      allDocs.map((d) =>
        prisma.document.create({
          data: { userId: user.id, title: d.title.slice(0, 100), content: d.content, source: "manual" },
        })
      )
    );
  }
  invalidateKnowledgeCache(user.id);

  // 5) Seed QuickReplies (persona pack first, then imported)
  const allQR = [...pack.quickReplies, ...imported.quickReplies];
  if (allQR.length) {
    await prisma.$transaction(
      allQR.slice(0, 50).map((qr) =>
        prisma.quickReply.create({
          data: {
            botId: bot.id,
            triggers: JSON.stringify(qr.triggers),
            reply: qr.reply.slice(0, 500),
            enabled: true,
          },
        })
      )
    );
  }

  // Activation funnel: merchant finished guided setup. Fire-and-forget.
  recordMilestone(user.id, "onboarding_completed", {
    documents: allDocs.length,
    quickReplies: allQR.length,
    businessType,
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    bot: { id: bot.id, name: bot.name, persona: bot.persona },
    seeded: {
      documents: allDocs.length,
      quickReplies: allQR.length,
      productsDetected: imported.productLines.length,
    },
  });
}
