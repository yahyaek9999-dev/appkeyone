// Reply Variation Engine — Phase B.
//
// Manages adaptive tone profiles, response variation, and confidence-aware
// reply modifications. Complements humanize.ts and human-realism.ts.
//
// Design rules:
//   - Pure functions only (no DB calls here)
//   - No LLM calls
//   - Works as a pre-prompt hint layer injected into buildMessages
//   - All transforms are probabilistic and low-frequency
//   - Quality-safe: never alters numbers, prices, or KB content

// ---------------------------------------------------------------------------
// Tone profiles — per-customer adaptive personality
// ---------------------------------------------------------------------------

export type ToneProfile =
  | "professional"   // default: formal, precise
  | "friendly"       // warm, casual Egyptian dialect
  | "concise"        // ultra-short, direct
  | "supportive"     // empathetic, patient
  | "sales_focused"  // conversion-oriented, energetic
  | "calm"           // de-escalation, slower pace
  | "enthusiastic";  // high energy, excitable

export interface ToneContext {
  customerTone?: string;     // from memory facts: calm | warm | impatient | skeptical | enthusiastic
  sentiment?: string | null;
  intent?: string | null;
  psychology?: string;       // hot | warm | cold | price_sensitive | impulse | hesitant
  isAnger?: boolean;
  isFirstMsg?: boolean;
  hour?: number;
}

/** Select the best tone profile for this interaction context. */
export function selectToneProfile(ctx: ToneContext): ToneProfile {
  // Anger/negative: always calm first
  if (ctx.isAnger || ctx.sentiment === "angry") return "calm";
  if (ctx.sentiment === "negative") return "supportive";

  // Match customer personality
  if (ctx.customerTone === "enthusiastic" || ctx.customerTone === "warm") return "friendly";
  if (ctx.customerTone === "impatient") return "concise";
  if (ctx.customerTone === "skeptical") return "professional";

  // Sales psychology
  if (ctx.psychology === "hot" || ctx.psychology === "impulse") return "sales_focused";
  if (ctx.psychology === "hesitant") return "supportive";
  if (ctx.psychology === "price_sensitive") return "professional";

  // Intent-based
  if (ctx.intent === "complaint" || ctx.intent === "support") return "supportive";
  if (ctx.intent === "buy") return "sales_focused";

  // Time of day: late night → calm
  if (ctx.hour !== undefined && ctx.hour >= 22) return "calm";
  if (ctx.hour !== undefined && (ctx.hour >= 8 && ctx.hour <= 12)) return "enthusiastic";

  return "professional";
}

/** Build a compact Arabic tone instruction for the system prompt (≤80 tokens). */
export function buildToneBlock(profile: ToneProfile, customerTone?: string): string {
  const tone: Record<ToneProfile, string> = {
    professional:  "الأسلوب: احترافي ودقيق — جمل قصيرة، معلومات محددة، بدون حشو.",
    friendly:      "الأسلوب: ودود وقريب — عامية مصرية خفيفة، مريح ومتفهم.",
    concise:       "الأسلوب: مختصر جداً — جملة أو اثنتان على الأكثر، مباشر بلا مقدمات.",
    supportive:    "الأسلوب: داعم ومتفهم — أظهر تعاطفاً حقيقياً، لا تتسرع في الحلول، استمع أولاً.",
    sales_focused: "الأسلوب: نشط وواثق — أكد الفوائد، وجّه لخطوة واحدة واضحة.",
    calm:          "الأسلوب: هادئ ومتزن — تكلم ببطء وأناة، لا تتجادل، ركّز على الحل.",
    enthusiastic:  "الأسلوب: متحمس وإيجابي — أبدِ اهتماماً حقيقياً، استخدم كلمات تشجيعية.",
  };
  return tone[profile] || tone.professional;
}

// ---------------------------------------------------------------------------
// Response variety hints — prevents robotic repetition in the system prompt
// ---------------------------------------------------------------------------

export interface VarietyHints {
  prohibitedOpenings?: string[];   // specific openings to avoid (detected repetitions)
  suggestedOpenings?: string[];    // fresh alternatives
  maxLength?: "short" | "medium" | "long";  // based on message complexity
}

/** Produce variety hints based on recent bot replies. */
export function buildVarietyHints(recentAssistantMessages: string[]): VarietyHints {
  if (!recentAssistantMessages.length) return {};

  // Detect repeated openings (first 3 words)
  const openingCounts: Record<string, number> = {};
  for (const msg of recentAssistantMessages.slice(-8)) {
    const first3 = msg.trim().split(/\s+/).slice(0, 3).join(" ").toLowerCase();
    if (first3.length > 3) {
      openingCounts[first3] = (openingCounts[first3] || 0) + 1;
    }
  }
  const prohibited = Object.entries(openingCounts)
    .filter(([, n]) => n >= 2)
    .map(([k]) => k)
    .slice(0, 3);

  // Fresh alternatives pool
  const freshPool = [
    "حاضر،", "تمام،", "بص،", "أكيد،", "طيب،", "ماشي،",
    "لحظة،", "فاهمك،", "ممتاز،", "طبعاً،", "مش مشكلة،",
  ];
  // Pick ones not in recent
  const recentFlat = recentAssistantMessages.slice(-3).join(" ").toLowerCase();
  const suggestions = freshPool.filter((f) => !recentFlat.includes(f.replace("،", ""))).slice(0, 4);

  return {
    prohibitedOpenings: prohibited.length ? prohibited : undefined,
    suggestedOpenings: suggestions.length ? suggestions : undefined,
  };
}

/** Convert variety hints into a compact Arabic system prompt addition (≤60 tokens). */
export function buildVarietyBlock(hints: VarietyHints): string {
  const lines: string[] = [];
  if (hints.prohibitedOpenings?.length) {
    lines.push(`لا تبدأ ردك بـ: ${hints.prohibitedOpenings.map((s) => `"${s}"`).join("، ")}.`);
  }
  if (hints.suggestedOpenings?.length) {
    lines.push(`بدائل مقترحة للبداية: ${hints.suggestedOpenings.join(" / ")}`);
  }
  if (hints.maxLength === "short") {
    lines.push("الرد: جملة واحدة أو جملتان فقط.");
  }
  return lines.join(" ");
}

// ---------------------------------------------------------------------------
// Confidence-aware response modifier
// Adds a soft uncertainty marker when the bot should admit partial knowledge
// ---------------------------------------------------------------------------

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ConfidenceContext {
  knowledgeBaseLength: number;   // chars available in KB
  messageComplexity: number;     // 0-100 complexity score
  isProductQuestion: boolean;
  hasMemory: boolean;
}

/** Estimate how confident the bot should be in its response. */
export function estimateConfidence(ctx: ConfidenceContext): ConfidenceLevel {
  // Short KB + complex question = lower confidence
  if (ctx.knowledgeBaseLength < 200 && ctx.messageComplexity > 60) return "low";
  if (ctx.knowledgeBaseLength < 500 && ctx.isProductQuestion) return "medium";
  if (ctx.knowledgeBaseLength > 2000 && ctx.hasMemory) return "high";
  if (ctx.messageComplexity > 80) return "medium";
  return "high";
}

/** Build a compact confidence hint for the system prompt. */
export function buildConfidenceBlock(level: ConfidenceLevel): string {
  if (level === "low") {
    return "معلوماتك قد تكون غير كاملة — قدّم ما تعرفه بصدق وأحل لفريق الدعم لو الموضوع تفصيلي.";
  }
  if (level === "medium") {
    return "أجب بما تعرفه بثقة، وأشر لفريق الدعم لو العميل احتاج تفاصيل تسعير أو توافر دقيقة.";
  }
  return ""; // high confidence: no extra block needed
}

// ---------------------------------------------------------------------------
// Slang / typo normalization hints for the system prompt
// ---------------------------------------------------------------------------

/** Arabic dialect and common typo hint to add to the system prompt once. */
export const DIALECT_BLOCK = `فهم اللهجات: افهم العامية المصرية والخليجية والشامية والكتابة بدون تشكيل أو همزات.
تسامح مع الأخطاء الإملائية الشائعة: "عارف"/"عرف"، "اشتريت"/"اشتري"، "بكام"/"بقد إيه".
لو الرسالة غامضة، افترض النية الأكثر احتمالاً واسأل عن تأكيد واحد فقط.`;

// ---------------------------------------------------------------------------
// Humanization quality metric (Phase G)
// ---------------------------------------------------------------------------

export interface HumanizationMetric {
  roboticIndicators: number;    // count of detected robotic patterns
  repetitionScore: number;      // 0-100 how repetitive are recent replies
  qualityScore: number;         // 0-100 overall humanization quality
}

const ROBOTIC_PATTERNS = [
  /^بكل تأكيد/i,
  /^أهلاً بك/i,
  /^شكراً لتواصلك/i,
  /^هل يمكنني مساعدتك/i,
  /^كيف يمكنني مساعدتك/i,
  /بكل سرور/i,
  /يسعدني مساعدتك/i,
  /بكل احترام/i,
  /لا تتردد في التواصل/i,
  /هل لديك استفسارات أخرى/i,
];

/** Measure humanization quality of a set of recent bot replies. */
export function measureHumanization(recentReplies: string[]): HumanizationMetric {
  if (!recentReplies.length) return { roboticIndicators: 0, repetitionScore: 0, qualityScore: 100 };

  let roboticCount = 0;
  for (const reply of recentReplies) {
    for (const pat of ROBOTIC_PATTERNS) {
      if (pat.test(reply.trim())) { roboticCount++; break; }
    }
  }

  // Repetition: opening bigrams
  const openings: Record<string, number> = {};
  for (const r of recentReplies) {
    const k = r.trim().split(/\s+/).slice(0, 2).join(" ").toLowerCase();
    if (k.length > 3) openings[k] = (openings[k] || 0) + 1;
  }
  const maxRepeat = Math.max(0, ...Object.values(openings));
  const repetitionScore = Math.min(100, maxRepeat * 20);

  const roboticScore = Math.min(100, (roboticCount / recentReplies.length) * 100);
  const qualityScore = Math.max(0, 100 - roboticScore * 0.6 - repetitionScore * 0.4);

  return {
    roboticIndicators: roboticCount,
    repetitionScore,
    qualityScore: Math.round(qualityScore),
  };
}
