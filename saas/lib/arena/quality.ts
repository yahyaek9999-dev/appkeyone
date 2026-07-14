// Testing Arena 2.1 — TA-4 Conversation Quality Benchmark.
//
// Deterministic quality scoring from real signals: arena conversations
// (resolution/flow), arena run (completeness/confidence/knowledge), brain
// benchmark (coverage), and open hallucination events (risk), PLUS an LLM-judge
// pass over a bounded sample of the arena's own synthetic test transcripts
// (ArenaConversation/ArenaMessage — not live customer data) for tone/accuracy/
// CSAT-proxy. The judge degrades gracefully: no provider configured, or the
// judge call failing, simply omits those three fields and `overall` falls back
// to the pre-existing deterministic formula (no regression for unconfigured tenants).
import { prisma } from "@/lib/db";
import { aiChatWithFailover } from "@/lib/integrations/ai";
import type { ChatMsg } from "@/lib/providers/types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
/** Bounded sample size — keeps judge cost/latency predictable regardless of tenant volume. */
const JUDGE_SAMPLE_SIZE = 6;

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
  const baseScore = clamp(
    0.25 * resolution +
      0.2 * completeness +
      0.2 * knowledge +
      0.15 * confidence +
      0.2 * flow -
      0.3 * hallucinationRisk,
  );

  const judge = await judgeConversationSample(userId, conversations);
  const overall = judge
    ? clamp(0.75 * baseScore + 0.25 * ((judge.tone + judge.accuracy + judge.csatProxy) / 3))
    : baseScore;

  const recommendations: string[] = [];
  if (resolution < 50) recommendations.push("معدّل الحل منخفض — أضف معرفة للفئات التي تتصعّد.");
  if (knowledge < 50) recommendations.push("تغطية المعرفة ضعيفة — ارفع مزيداً من المستندات.");
  if (hallucinationRisk > 0)
    recommendations.push("توجد مخاطر هلوسة مفتوحة — راجع صفحة «كشف الهلوسة».");
  if (flow < 60 && totalConv > 0)
    recommendations.push("كثير من المحادثات تتصعّد سريعاً — أضف ردوداً وسيطة قبل التصعيد.");
  if (judge && judge.tone < 50) recommendations.push("نبرة الردود ضعيفة حسب تقييم النموذج — راجع تعليمات الأسلوب.");
  if (judge && judge.accuracy < 50) recommendations.push("دقة الإجابات ضعيفة حسب تقييم النموذج — راجع معرفة المنتج.");
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
      tone: judge?.tone ?? null,
      accuracy: judge?.accuracy ?? null,
      csatProxy: judge?.csatProxy ?? null,
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
    tone: judge?.tone ?? null,
    accuracy: judge?.accuracy ?? null,
    csatProxy: judge?.csatProxy ?? null,
    recommendations,
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
  };
}

type JudgeResult = { tone: number; accuracy: number; csatProxy: number; sampleSize: number };

/** LLM-judges a bounded sample of the arena's own synthetic test transcripts
 *  (never live customer conversations) for tone/accuracy/predicted-CSAT.
 *  Returns null (not zeros) when no provider is configured or every judged
 *  call fails, so callers can distinguish "not measured" from "measured low". */
async function judgeConversationSample(
  userId: string,
  conversations: { id: string; turns: number }[],
): Promise<JudgeResult | null> {
  const candidates = conversations.filter((c) => c.turns > 0).slice(0, JUDGE_SAMPLE_SIZE);
  if (!candidates.length) return null;

  const transcripts = await Promise.all(
    candidates.map((c) =>
      prisma.arenaMessage.findMany({
        where: { conversationId: c.id, userId },
        orderBy: { turn: "asc" },
        take: 12,
      }),
    ),
  );

  const scored: { tone: number; accuracy: number; csatProxy: number }[] = [];
  for (const msgs of transcripts) {
    if (!msgs.length) continue;
    const transcript = msgs
      .map((m) => `${m.role === "customer" ? "العميل" : "المساعد"}: ${m.content}`)
      .join("\n")
      .slice(0, 3000);
    const messages: ChatMsg[] = [
      {
        role: "system",
        content:
          'أنت مقيّم جودة محادثات خدمة عملاء. اقرأ المحادثة وأعد تقييماً بصيغة JSON فقط بدون أي نص إضافي بالشكل: {"tone":0-100,"accuracy":0-100,"csatProxy":0-100}. tone = مدى احترافية ولطف نبرة المساعد. accuracy = مدى دقة واتساق إجابات المساعد مع سياق المحادثة. csatProxy = توقعك لرضا العميل عن هذه المحادثة.',
      },
      { role: "user", content: transcript },
    ];
    try {
      const r = await aiChatWithFailover(userId, messages, { temperature: 0.2, maxTokens: 120, timeoutMs: 20000 });
      if (!r.ok) return null; // no provider configured / all failed — stop sampling, degrade to base score
      const parsed = safeParseJudge(r.result.text);
      if (parsed) scored.push(parsed);
    } catch {
      return null;
    }
  }
  if (!scored.length) return null;

  const avg = (k: "tone" | "accuracy" | "csatProxy") =>
    clamp(scored.reduce((s, x) => s + x[k], 0) / scored.length);
  return { tone: avg("tone"), accuracy: avg("accuracy"), csatProxy: avg("csatProxy"), sampleSize: scored.length };
}

function safeParseJudge(text: string): { tone: number; accuracy: number; csatProxy: number } | null {
  try {
    const match = (text || "").match(/\{[^{}]*\}/);
    if (!match) return null;
    const j = JSON.parse(match[0]);
    const n = (v: any) => clamp(Number(v) || 0);
    if (typeof j.tone !== "number" && typeof j.tone !== "string") return null;
    return { tone: n(j.tone), accuracy: n(j.accuracy), csatProxy: n(j.csatProxy) };
  } catch {
    return null;
  }
}
