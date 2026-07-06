// Testing Arena 2.1 — TA-7 Brain Benchmark + TA-9 AI Readiness Score.
//
// Both are computed entirely from the tenant's REAL signals (arena coverage,
// knowledge gaps/conflicts, graph density, audit score, integrations, catalog,
// escalation config). No LLM, no mock values. Each run is persisted for history.
import { prisma } from "@/lib/db";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export interface BrainBenchmarkResult {
  coverage: number;
  retrievalAccuracy: number;
  missingKnowledge: number;
  conflicts: number;
  density: number;
  health: number;
  score: number;
  recommendations: string[];
}

export async function computeBrainBenchmark(userId: string): Promise<BrainBenchmarkResult> {
  const [arena, gNodes, gEdges, gaps, conflicts] = await Promise.all([
    prisma.arenaRun.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.knowledgeGraphNode.count({ where: { userId } }),
    prisma.knowledgeGraphEdge.count({ where: { userId } }),
    (prisma as any).knowledgeGap.count({ where: { userId, resolved: false } }),
    (prisma as any).knowledgeConflict.count({ where: { userId, resolved: false } }),
  ]);

  const coverage =
    arena && arena.total ? clamp((100 * (arena.passed + 0.5 * arena.weak)) / arena.total) : 0;
  const retrievalAccuracy = arena ? clamp(arena.avgConfidence) : 0;
  const density = gNodes > 1 ? clamp((100 * gEdges) / ((gNodes * (gNodes - 1)) / 2)) : 0;
  const health = clamp(coverage - conflicts * 8 - Math.min(20, gaps * 2));
  const score = clamp(0.4 * coverage + 0.25 * retrievalAccuracy + 0.2 * health + 0.15 * density);

  const recommendations: string[] = [];
  if (!arena) recommendations.push("شغّل «ساحة الاختبار» أولاً لقياس تغطية المعرفة فعلياً.");
  if (coverage < 50)
    recommendations.push("التغطية منخفضة — أضف مستندات لتغطية أسئلة العملاء المتكررة.");
  if (conflicts > 0)
    recommendations.push(`حُلّ ${conflicts} تعارضاً في المعرفة لتفادي إجابات متضاربة.`);
  if (gaps > 5) recommendations.push(`أجب على ${gaps} فجوة معرفية متكررة.`);
  if (density < 20 && gNodes > 2)
    recommendations.push("الترابط بين عناصر المعرفة ضعيف — اربط المنتجات بالمستندات.");

  await prisma.brainBenchmark.create({
    data: {
      userId,
      coverage,
      retrievalAccuracy,
      missingKnowledge: gaps,
      conflicts,
      density,
      health,
      score,
    },
  });
  return {
    coverage,
    retrievalAccuracy,
    missingKnowledge: gaps,
    conflicts,
    density,
    health,
    score,
    recommendations,
  };
}

export interface ReadinessResult {
  knowledge: number;
  arena: number;
  monitoring: number;
  revenue: number;
  prompts: number;
  integrations: number;
  automation: number;
  score: number;
  level: string;
}

export async function computeReadiness(
  userId: string,
  brainScore: number,
): Promise<ReadinessResult> {
  const [arena, audit, bot, integrations, products, orders, openTickets] = await Promise.all([
    prisma.arenaRun.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.aiAuditRun.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.bot.findUnique({ where: { userId } }),
    (prisma as any).commerceIntegration.count({ where: { userId } }).catch(() => 0),
    prisma.product.count({ where: { userId } }),
    prisma.order.count({ where: { userId } }),
    (prisma as any).escalationTicket.count({
      where: { userId, status: { in: ["open", "acknowledged", "human_active"] } },
    }),
  ]);
  const qrCount = bot ? await prisma.quickReply.count({ where: { botId: bot.id } }) : 0;

  const knowledge = clamp(brainScore);
  const arenaScore = arena ? clamp(arena.score) : 0;
  const prompts = audit ? clamp(audit.score) : 0;
  const waConnected = (bot as any)?.whatsappStatus === "connected";
  const integrationsScore = clamp((waConnected ? 50 : 0) + Math.min(50, integrations * 25));
  const automation = clamp(qrCount * 20 + (bot ? 20 : 0));
  const monitoring = clamp(
    ((bot as any)?.escalationAutoPause ? 60 : 30) + Math.max(0, 40 - openTickets * 10),
  );
  const revenue = clamp(products * 8 + Math.min(40, orders * 4));

  const parts = [
    knowledge,
    arenaScore,
    monitoring,
    revenue,
    prompts,
    integrationsScore,
    automation,
  ];
  const score = clamp(parts.reduce((a, b) => a + b, 0) / parts.length);
  const level =
    score >= 80 ? "excellent" : score >= 60 ? "good" : score >= 40 ? "weak" : "critical";

  await prisma.readinessScore.create({
    data: {
      userId,
      knowledge,
      arena: arenaScore,
      monitoring,
      revenue,
      prompts,
      integrations: integrationsScore,
      automation,
      score,
      level,
    },
  });
  return {
    knowledge,
    arena: arenaScore,
    monitoring,
    revenue,
    prompts,
    integrations: integrationsScore,
    automation,
    score,
    level,
  };
}

export async function runBenchmarks(userId: string) {
  const brain = await computeBrainBenchmark(userId);
  const readiness = await computeReadiness(userId, brain.score);
  return { brain, readiness };
}

export async function getBenchmarks(userId: string) {
  const [brain, readiness, brainHistory, readinessHistory] = await Promise.all([
    prisma.brainBenchmark.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.readinessScore.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.brainBenchmark.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.readinessScore.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  return { brain, readiness, brainHistory, readinessHistory };
}
