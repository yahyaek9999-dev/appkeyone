/**
 * Testing Arena audit engine (Area 10).
 *
 * Turns the playground from a chat sandbox into a real readiness audit: it runs
 * a fixed set of customer scenarios, checks setup/AI/knowledge, scores each
 * response, surfaces concrete weaknesses, and links every weakness to the exact
 * settings page that fixes it.
 *
 * Read-only: it reuses the SAME reply pipeline (generateBotReply) and KB
 * retrieval (retrieveRelevantKb) the live bot uses, but persists NOTHING — no
 * messages, customers, escalations or usage rows are written. It never touches
 * the WhatsApp send pipeline.
 */

import { prisma } from "@/lib/db";
import { retrieveRelevantKb } from "@/lib/kb-cache";
import { buildMessages } from "@/lib/llm";
import { generateBotReply } from "@/lib/integrations/ai/reply";

export interface ArenaScenario {
  id: string;
  label: string;
  message: string;
  /** Whether a healthy KB is expected to ground the answer. */
  kbExpected: boolean;
}

// Representative Egyptian-Arabic customer journeys covering the core intents a
// merchant bot must handle.
export const ARENA_SCENARIOS: ArenaScenario[] = [
  { id: "greeting", label: "ترحيب", message: "السلام عليكم", kbExpected: false },
  { id: "price", label: "سؤال عن السعر", message: "المنتج ده بكام؟", kbExpected: true },
  { id: "availability", label: "توفر المنتج", message: "المنتج متوفر حالياً؟", kbExpected: true },
  {
    id: "shipping",
    label: "الشحن والتوصيل",
    message: "الشحن بياخد كام يوم وبكام؟",
    kbExpected: true,
  },
  {
    id: "returns",
    label: "سياسة الإرجاع",
    message: "أقدر أرجّع المنتج لو مش عاجبني؟",
    kbExpected: true,
  },
  {
    id: "complaint",
    label: "شكوى / غضب",
    message: "أنا زعلان جداً، الطلب وصل متأخر وبجودة سيئة!",
    kbExpected: false,
  },
];

export interface ScenarioResult {
  id: string;
  label: string;
  message: string;
  reply: string | null;
  replied: boolean;
  grounded: boolean;
  score: number; // 0-100
  notes: string[];
  source?: string; // registry | legacy | keyone
}

export interface ArenaWeakness {
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
  fixHref: string;
  fixLabel: string;
}

export interface ArenaReadiness {
  botConfigured: boolean;
  aiMode: "keyone" | "custom" | "misconfigured";
  knowledgeDocs: number;
  knowledgeChars: number;
  knowledgeReady: boolean;
  quickReplies: number;
  whatsappConnected: boolean;
  welcomeMessage: boolean;
  storeConnected: boolean;
  automations: number;
}

/** Per-dimension scores (0-100), surfaced as the Arena scoreboard. */
export interface ArenaScores {
  readiness: number;
  ai: number;
  knowledge: number;
  whatsapp: number;
  store: number;
  automation: number;
}

export interface ArenaAuditResult {
  overallScore: number; // 0-100
  grade: "ممتاز" | "جيد" | "يحتاج تحسين" | "ضعيف";
  readiness: ArenaReadiness;
  scores: ArenaScores;
  scenarios: ScenarioResult[];
  weaknesses: ArenaWeakness[];
  ranGeneration: boolean;
}

function gradeFor(score: number): ArenaAuditResult["grade"] {
  if (score >= 85) return "ممتاز";
  if (score >= 65) return "جيد";
  if (score >= 40) return "يحتاج تحسين";
  return "ضعيف";
}

/**
 * Run the full audit for a workspace owner id.
 * @param opts.generate when false, skips live LLM calls (readiness + KB only).
 */
export async function runArenaAudit(
  userId: string,
  opts: { generate?: boolean } = {},
): Promise<ArenaAuditResult> {
  const generate = opts.generate !== false;

  const bot: any = await prisma.bot.findUnique({ where: { userId } }).catch(() => null);

  const [docAgg, quickReplyCount, storeCount, automationCount] = await Promise.all([
    // Core table: do NOT mask DB errors here — a real failure must surface (the
    // caller route returns audit_failed) rather than fabricate a zero knowledge
    // score. (silent-failure review fix.) Optional tables below keep their catch.
    prisma.document.findMany({ where: { userId }, select: { content: true } }),
    bot ? prisma.quickReply.count({ where: { botId: bot.id } }).catch(() => 0) : Promise.resolve(0),
    (prisma as any).commerceIntegration.count({ where: { userId, enabled: true } }).catch(() => 0),
    (prisma as any).commerceAutomation.count({ where: { userId, enabled: true } }).catch(() => 0),
  ]);
  const knowledgeDocs = docAgg.length;
  const knowledgeChars = docAgg.reduce((sum: number, d: any) => sum + (d.content?.length || 0), 0);

  // ---- Readiness ----
  const botConfigured = Boolean(bot && bot.name && (bot.systemPrompt || bot.persona));
  const provider = String(bot?.aiProvider || "keyone");
  const aiMode: ArenaReadiness["aiMode"] =
    provider === "keyone" || !provider ? "keyone" : bot?.aiApiKeyEnc ? "custom" : "misconfigured";
  const knowledgeReady = knowledgeDocs > 0 && knowledgeChars >= 400;
  const readiness: ArenaReadiness = {
    botConfigured,
    aiMode,
    knowledgeDocs,
    knowledgeChars,
    knowledgeReady,
    quickReplies: quickReplyCount,
    whatsappConnected: bot?.whatsappStatus === "connected",
    welcomeMessage: Boolean(bot?.welcomeMessage),
    storeConnected: storeCount > 0,
    automations: automationCount,
  };

  // Per-dimension scoreboard (Area 13).
  const scores: ArenaScores = {
    readiness: Math.round(
      (((botConfigured ? 1 : 0) +
        (readiness.welcomeMessage ? 1 : 0) +
        (quickReplyCount > 0 ? 1 : 0)) /
        3) *
        100,
    ),
    ai: aiMode === "custom" ? 100 : aiMode === "keyone" ? 70 : 0,
    knowledge:
      knowledgeDocs === 0
        ? 0
        : Math.min(100, Math.round((Math.min(knowledgeChars, 6000) / 6000) * 100)),
    whatsapp: readiness.whatsappConnected ? 100 : 0,
    store: storeCount > 0 ? 100 : 0,
    automation: automationCount === 0 ? 0 : Math.min(100, automationCount * 25),
  };

  // ---- Scenarios ----
  const scenarios: ScenarioResult[] = [];
  for (const sc of ARENA_SCENARIOS) {
    const notes: string[] = [];
    const kb = await retrieveRelevantKb(userId, sc.message, {
      k: 4,
      charBudget: 2000,
      minScore: 0.08,
    }).catch(() => "");
    const grounded = kb.trim().length > 0;

    let reply: string | null = null;
    let source: string | undefined;
    if (generate && bot) {
      try {
        const messages = buildMessages({
          systemPrompt: bot.systemPrompt || "",
          botName: bot.name || "المساعد",
          persona: bot.persona || "",
          welcomeMessage: bot.welcomeMessage || undefined,
          knowledgeBase: kb || undefined,
          history: [],
          newUserMsg: sc.message,
          customerName: "عميل تجريبي",
        });
        const r = await generateBotReply({
          userId,
          bot,
          messages,
          maxTokens: 220,
          timeoutMs: 12_000,
        });
        reply = (r.text || "").trim();
        source = r.source;
      } catch (e: any) {
        notes.push("تعذّر توليد رد — تحقّق من إعداد مزوّد الذكاء الاصطناعي.");
      }
    }

    const replied = Boolean(reply && reply.length > 0);

    // Transparent scoring. KB-expected scenarios weight grounding; all weight a
    // produced, non-trivial reply.
    let score = 0;
    if (replied) {
      score += 45;
      if (reply!.length >= 25) score += 15;
      else notes.push("الرد قصير جداً.");
    } else if (generate) {
      notes.push("لم يصدر رد.");
    }
    if (sc.kbExpected) {
      if (grounded) score += 40;
      else notes.push("لا توجد معرفة كافية للإجابة على هذا السؤال.");
    } else {
      score += 40; // non-KB scenarios are not penalized for missing KB
    }
    // When generation is skipped, score is KB-coverage only (max 40 for
    // kbExpected, 40 baseline otherwise) — still meaningful as a readiness read.
    if (!generate) score = sc.kbExpected ? (grounded ? 100 : 30) : 100;

    scenarios.push({
      id: sc.id,
      label: sc.label,
      message: sc.message,
      reply,
      replied,
      grounded,
      score: Math.min(100, score),
      notes,
      source,
    });
  }

  // ---- Weaknesses + fixes ----
  const weaknesses: ArenaWeakness[] = [];
  if (!botConfigured) {
    weaknesses.push({
      title: "إعداد المساعد غير مكتمل",
      detail: "لم يتم ضبط اسم/شخصية/تعليمات المساعد بعد.",
      severity: "high",
      fixHref: "/dashboard/bot",
      fixLabel: "اضبط المساعد",
    });
  }
  if (aiMode === "misconfigured") {
    weaknesses.push({
      title: "مزوّد ذكاء اصطناعي بدون مفتاح",
      detail: "اخترت مزوّداً خارجياً لكن لم تُدخل مفتاح API صالحاً.",
      severity: "high",
      fixHref: "/dashboard/settings/ai-provider",
      fixLabel: "أصلح مزوّد الذكاء",
    });
  }
  if (!knowledgeReady) {
    weaknesses.push({
      title: "قاعدة المعرفة ضعيفة",
      detail:
        knowledgeDocs === 0
          ? "لا توجد مستندات معرفة — البوت لن يقدر يجاوب على الأسعار والسياسات."
          : "محتوى المعرفة قليل — أضف المزيد عن المنتجات والأسعار والسياسات.",
      severity: "high",
      fixHref: "/dashboard/knowledge-brain",
      fixLabel: "أضف معرفة",
    });
  }
  if (!readiness.whatsappConnected) {
    weaknesses.push({
      title: "واتساب غير متصل",
      detail: "اربط رقم واتساب حتى تصل ردود البوت للعملاء.",
      severity: "medium",
      fixHref: "/dashboard/whatsapp",
      fixLabel: "اربط واتساب",
    });
  }
  if (readiness.quickReplies === 0) {
    weaknesses.push({
      title: "لا توجد ردود سريعة",
      detail: "الردود السريعة تسرّع الإجابات الشائعة وتقلّل التصعيد.",
      severity: "low",
      fixHref: "/dashboard/quick-replies",
      fixLabel: "أضف ردوداً سريعة",
    });
  }
  if (!readiness.storeConnected) {
    weaknesses.push({
      title: "لا يوجد متجر مربوط",
      detail: "اربط متجرك (Shopify/Woo/Salla/Zid) لمزامنة المنتجات والطلبات تلقائياً.",
      severity: "medium",
      fixHref: "/dashboard/integrations",
      fixLabel: "اربط متجراً",
    });
  }
  if (readiness.automations === 0) {
    weaknesses.push({
      title: "لا توجد أتمتة مفعّلة",
      detail: "فعّل أتمتة الطلبات (تأكيد/شحن/تسليم) لإرسال تحديثات تلقائية للعملاء.",
      severity: "low",
      fixHref: "/dashboard/automations",
      fixLabel: "فعّل الأتمتة",
    });
  }
  // Per-scenario knowledge gaps.
  const ungrounded = scenarios.filter(
    (s) => ARENA_SCENARIOS.find((x) => x.id === s.id)?.kbExpected && !s.grounded,
  );
  if (ungrounded.length > 0 && knowledgeReady) {
    weaknesses.push({
      title: `${ungrounded.length} سيناريو بدون تغطية معرفية`,
      detail: "أضف محتوى يغطّي: " + ungrounded.map((s) => s.label).join("، ") + ".",
      severity: "medium",
      fixHref: "/dashboard/knowledge-brain",
      fixLabel: "وسّع المعرفة",
    });
  }

  const overallScore = Math.round(
    scenarios.reduce((sum, s) => sum + s.score, 0) / (scenarios.length || 1),
  );

  return {
    overallScore,
    grade: gradeFor(overallScore),
    readiness,
    scores,
    scenarios,
    weaknesses,
    ranGeneration: generate && Boolean(bot),
  };
}
