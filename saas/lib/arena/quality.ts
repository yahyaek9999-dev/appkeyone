// Testing Arena 2.1 — TA-4 Conversation Quality Benchmark.
//
// Deterministic quality scoring from real signals: arena conversations
// (resolution/flow), arena run (completeness/confidence/knowledge), brain
// benchmark (coverage), and open hallucination events (risk). Tone / accuracy /
// satisfaction-prediction require an LLM → READY FOR CONFIGURATION.
import { prisma } from "@/lib/db";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
export const QUALITY_READY_FOR_CONFIG = [
  "نبرة الرد (Tone)",
  "دقة الإجابة (Accuracy)",
  "توقّع رضا العميل (CSAT)",
];

export async function computeQuality(userId: string) {
  const [arena, conversations, brain, openHigh, openMed] = await Promise.all([
    prisma.arenaRun.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.arenaConversation.findMany({ where: { userId } }),
    prisma.brainBenchmark.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.hallucinationEvent.count({ where: { userId, status: "open", severity: "high" } }),
    prisma.hallucinationEvent.count({ where: { userId, status: "open", severity: "medium" } }),
  ]);

  const totalConv = conversations.length;
  const resolvedConv = conversations.filter((c) => c.resolutionState === "resolved").length;
  const escalatedConv = conversations.filter((c) => c.resolutionState === "escalated").length;

  const resolution = totalConv ? clamp((100 * resolvedConv) / totalConv) : 0;
  const completeness = arena && arena.total ? clamp((100 * arena.passed) / arena.total) : 0;
  const knowledge = brain
    ? clamp(brain.coverage)
    : arena && arena.total
      ? clamp((100 * (arena.passed + 0.5 * arena.weak)) / arena.total)
      : 0;
  const confidence = arena ? clamp(arena.avgConfidence) : 0;
  const flow = totalConv ? clamp(100 - (100 * escalatedConv) / totalConv) : 0;
  const hallucinationRisk = clamp(openHigh * 15 + openMed * 8);
  const overall = clamp(
    0.25 * resolution +
      0.2 * completeness +
      0.2 * knowledge +
      0.15 * confidence +
      0.2 * flow -
      0.3 * hallucinationRisk,
  );

  const recommendations: string[] = [];
  if (resolution < 50) recommendations.push("معدّل الحل منخفض — أضف معرفة للفئات التي تتصعّد.");
  if (knowledge < 50) recommendations.push("تغطية المعرفة ضعيفة — ارفع مزيداً من المستندات.");
  if (hallucinationRisk > 0)
    recommendations.push("توجد مخاطر هلوسة مفتوحة — راجع صفحة «كشف الهلوسة».");
  if (flow < 60 && totalConv > 0)
    recommendations.push("كثير من المحادثات تتصعّد سريعاً — أضف ردوداً وسيطة قبل التصعيد.");
  if (!recommendations.length) recommendations.push("جودة المحادثة جيدة — استمر في إثراء المعرفة.");

  await prisma.qualityBenchmark.create({
    data: {
      userId,
      resolution,
      completeness,
      knowledge,
      confidence,
      flow,
      hallucinationRisk,
      overall,
    },
  });
  return {
    resolution,
    completeness,
    knowledge,
    confidence,
    flow,
    hallucinationRisk,
    overall,
    recommendations,
    readyForConfiguration: QUALITY_READY_FOR_CONFIG,
  };
}

export async function getQuality(userId: string) {
  const [latest, history] = await Promise.all([
    prisma.qualityBenchmark.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.qualityBenchmark.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);
  return {
    latest,
    history,
    trend: history
      .slice()
      .reverse()
      .map((h) => h.overall),
    readyForConfiguration: QUALITY_READY_FOR_CONFIG,
  };
}
