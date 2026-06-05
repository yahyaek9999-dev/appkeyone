/**
 * One-time migration: replace AI marketing text in the database with
 * business-focused wording consistent with the rest of the platform.
 *
 * Safe to run multiple times (idempotent where-guards).
 * Run with: npx tsx scripts/fix-ai-text.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ── 1. Footer tagline ─────────────────────────────────────────────────────
  const cfg = await prisma.siteConfig.findUnique({ where: { id: "singleton" } });
  if (
    cfg &&
    (cfg.brandTagline.includes("الذكاء الاصطناعي") ||
      cfg.brandTagline.includes("بوت واتساب احترافي"))
  ) {
    await prisma.siteConfig.update({
      where: { id: "singleton" },
      data: { brandTagline: "أتمتة واتساب — ردود فورية، مبيعات أعلى، عملاء أسعد" },
    });
    console.log("✓ brandTagline updated");
  } else {
    console.log("ℹ brandTagline already clean, skipping");
  }

  // ── 2. Max plan — description & features ─────────────────────────────────
  const maxPlan = await prisma.plan.findUnique({ where: { slug: "max" } });
  if (maxPlan) {
    const features: string[] = JSON.parse(maxPlan.features || "[]");
    const hasAiText =
      maxPlan.description.includes("الذكاء الاصطناعي") ||
      features.some((f) => f.includes("ذكاء اصطناعي"));

    if (hasAiText) {
      const cleanedFeatures = features.map((f) =>
        f.replace("ذكاء اصطناعي متقدم (مزود خارجي مدمج)", "معالجة متقدمة للصور والمستندات والأوامر"),
      );
      await prisma.plan.update({
        where: { slug: "max" },
        data: {
          description: "للمتاجر والعلامات التي تحتاج طاقة أكبر وتحكماً كاملاً",
          features: JSON.stringify(cleanedFeatures),
        },
      });
      console.log("✓ max plan description & features updated");
    } else {
      console.log("ℹ max plan already clean, skipping");
    }
  }

  console.log("✓ Done — all AI marketing text removed from database");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
