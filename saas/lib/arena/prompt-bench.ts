// Testing Arena 2.1 — TA-6 Prompt Benchmark.
//
// Compares up to 3 prompt candidates (the tenant's prompt versions, else
// built-in A/B/C) on a DETERMINISTIC prompt-quality rubric (price-accuracy,
// lead capture, escalation, tone, language, scope) — the real differentiator
// without an LLM — plus shared retrieval/arena/brain context. Comparing the
// actual GENERATED responses needs an LLM → READY FOR CONFIGURATION.
import { prisma } from "@/lib/db";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
export const PROMPT_READY_FOR_CONFIG = ["مقارنة الردود المولّدة", "جودة الأسلوب", "دقة المخرجات"];

const RUBRIC: { key: string; re: RegExp }[] = [
  { key: "price", re: /لا تخترع|لا تختلق|بدقة|الأسعار|سعر/ },
  { key: "lead", re: /اسم|رقم|واتساب|تواصل|الاشتراك/ },
  { key: "escalation", re: /الإدارة|مسؤول|تحويل|تصعيد/ },
  { key: "tone", re: /احترام|ودود|اختصار|نبرة|لهجة|بأدب/ },
  { key: "language", re: /بالعربية|العربية|عربي/ },
  { key: "scope", re: /المتوفرة فقط|معلومات الشركة|خارج معلوماتك|لا تجب على/ },
];
function rubricScore(body: string) {
  let m = 0;
  for (const r of RUBRIC) if (r.re.test(body || "")) m++;
  return clamp((100 * m) / RUBRIC.length);
}

const DEFAULT_CANDIDATES = [
  { label: "A — افتراضي", body: "أنت مساعد مبيعات. رد على العملاء." },
  {
    label: "B — متوازن",
    body: "أنت مساعد مبيعات رسمي. تكلم بالعربية باحترام واختصار، اعرض الأسعار بدقة من معلومات الشركة المتوفرة فقط ولا تخترع سعراً.",
  },
  {
    label: "C — احترافي",
    body: "أنت مساعد المبيعات الرسمي. تكلم بالعربية بنبرة ودودة محترمة وباختصار. اعرض المنتجات والأسعار بدقة من المعلومات المتوفرة فقط ولا تخترع أي سعر. اجمع اسم العميل ورقم واتسابه عند نية الشراء ووجّهه للإدارة لإتمام الاشتراك. لو السؤال خارج معلوماتك اعتذر وحوّله لمسؤول.",
  },
];

export async function runPromptBenchmark(userId: string) {
  const versions = await prisma.promptVersion.findMany({
    where: { userId },
    orderBy: { version: "desc" },
    take: 3,
  });
  let cands = versions.map((v) => ({ label: `v${v.version} — ${v.title}`, body: v.body }));
  while (cands.length < 3) cands.push(DEFAULT_CANDIDATES[cands.length]);
  cands = cands.slice(0, 3);

  const [arena, brain, conversations, openHigh, openMed] = await Promise.all([
    prisma.arenaRun.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.brainBenchmark.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.arenaConversation.findMany({ where: { userId } }),
    prisma.hallucinationEvent.count({ where: { userId, status: "open", severity: "high" } }),
    prisma.hallucinationEvent.count({ where: { userId, status: "open", severity: "medium" } }),
  ]);
  const totalConv = conversations.length;
  const resolution = totalConv
    ? clamp(
        (100 * conversations.filter((c) => c.resolutionState === "resolved").length) / totalConv,
      )
    : 0;
  const knowledgeCoverage =
    arena && arena.total ? clamp((100 * (arena.passed + 0.5 * arena.weak)) / arena.total) : 0;
  const confidence = arena ? clamp(arena.avgConfidence) : 0;
  const arenaScore = arena ? clamp(arena.score) : 0;
  const brainScore = brain ? clamp(brain.score) : 0;
  const hallucinationRisk = clamp(openHigh * 15 + openMed * 8);
  const conversationQuality = clamp(0.5 * resolution + 0.5 * knowledgeCoverage);

  const scores = cands.map((c) => {
    const rubric = rubricScore(c.body);
    return { label: c.label, rubric, overall: clamp(0.7 * rubric + 0.3 * arenaScore) };
  });
  const winnerIdx = scores.reduce(
    (best, s, i, arr) => (s.overall > arr[best].overall ? i : best),
    0,
  );
  const winner = scores[winnerIdx].label;

  const run = await prisma.promptBenchmark.create({
    data: {
      userId,
      aLabel: scores[0].label,
      aScore: scores[0].overall,
      bLabel: scores[1].label,
      bScore: scores[1].overall,
      cLabel: scores[2].label,
      cScore: scores[2].overall,
      winner,
      knowledgeCoverage,
      confidence,
      resolution,
      hallucinationRisk,
      arenaScore,
      brainScore,
      conversationQuality,
    },
  });
  return { run, scores, winner, readyForConfiguration: PROMPT_READY_FOR_CONFIG };
}

export async function getPromptBenchmarks(userId: string) {
  const [latest, history] = await Promise.all([
    prisma.promptBenchmark.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.promptBenchmark.findMany({
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
      .map((h) => Math.max(h.aScore, h.bScore, h.cScore)),
    readyForConfiguration: PROMPT_READY_FOR_CONFIG,
  };
}
