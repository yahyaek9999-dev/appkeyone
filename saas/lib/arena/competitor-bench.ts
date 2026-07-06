// Testing Arena 2.1 — TA-8 Competitor Benchmark (real, persisted runs).
//
// KEYONE's per-dimension scores are computed from the tenant's REAL setup and
// persisted per run (history + trend). Competitor baselines are reference data
// (industry capability levels) shown for comparison — labelled as such.
import { prisma } from "@/lib/db";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export const DIMENSIONS = [
  { key: "knowledge", label: "المعرفة" },
  { key: "automation", label: "الأتمتة" },
  { key: "support", label: "الدعم" },
  { key: "monitoring", label: "الرصد" },
  { key: "aiReadiness", label: "جاهزية الذكاء" },
  { key: "conversationQuality", label: "جودة المحادثة" },
] as const;

// Reference capability baselines (0-100) per competitor per dimension.
export const COMPETITOR_BASELINES: Record<string, Record<string, number>> = {
  intercom: {
    knowledge: 85,
    automation: 78,
    support: 90,
    monitoring: 80,
    aiReadiness: 85,
    conversationQuality: 88,
  },
  zendesk: {
    knowledge: 88,
    automation: 72,
    support: 92,
    monitoring: 82,
    aiReadiness: 80,
    conversationQuality: 85,
  },
  manychat: {
    knowledge: 55,
    automation: 85,
    support: 60,
    monitoring: 55,
    aiReadiness: 60,
    conversationQuality: 65,
  },
  freshdesk: {
    knowledge: 80,
    automation: 70,
    support: 85,
    monitoring: 75,
    aiReadiness: 72,
    conversationQuality: 78,
  },
};
const COMPETITORS = Object.keys(COMPETITOR_BASELINES);

export async function computeCompetitorBenchmark(userId: string) {
  const [brain, readiness, bot, openTickets, conversations] = await Promise.all([
    prisma.brainBenchmark.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.readinessScore.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.bot.findUnique({ where: { userId } }),
    (prisma as any).escalationTicket.count({
      where: { userId, status: { in: ["open", "acknowledged", "human_active"] } },
    }),
    prisma.arenaConversation.findMany({ where: { userId }, select: { resolutionState: true } }),
  ]);
  const qrCount = bot ? await prisma.quickReply.count({ where: { botId: bot.id } }) : 0;

  const knowledge = brain ? clamp(brain.score) : 0;
  const automation = clamp(qrCount * 20 + (bot ? 20 : 0));
  const support = clamp(
    ((bot as any)?.escalationAutoPause ? 60 : 30) + Math.max(0, 40 - openTickets * 10),
  );
  const monitoring = readiness ? clamp(readiness.monitoring) : support;
  const aiReadiness = readiness ? clamp(readiness.score) : 0;
  const resolved = conversations.filter((c) => c.resolutionState === "resolved").length;
  const conversationQuality = conversations.length
    ? clamp((100 * resolved) / conversations.length)
    : 0;
  const overall = clamp(
    (knowledge + automation + support + monitoring + aiReadiness + conversationQuality) / 6,
  );

  const run = await prisma.competitorBenchmark.create({
    data: {
      userId,
      knowledge,
      automation,
      support,
      monitoring,
      aiReadiness,
      conversationQuality,
      overall,
    },
  });
  return run;
}

export async function getCompetitorBenchmarks(userId: string) {
  const [latest, history] = await Promise.all([
    prisma.competitorBenchmark.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.competitorBenchmark.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  let strengths: string[] = [],
    weaknesses: string[] = [];
  if (latest) {
    for (const d of DIMENSIONS) {
      const mine = (latest as any)[d.key] as number;
      const avg =
        COMPETITORS.reduce((s, c) => s + COMPETITOR_BASELINES[c][d.key], 0) / COMPETITORS.length;
      if (mine >= avg) strengths.push(d.label);
      else weaknesses.push(d.label);
    }
  }
  return {
    latest,
    history,
    dimensions: DIMENSIONS,
    competitorBaselines: COMPETITOR_BASELINES,
    strengths,
    weaknesses,
    trend: history
      .slice()
      .reverse()
      .map((h) => h.overall),
  };
}
