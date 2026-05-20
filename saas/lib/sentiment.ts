export type RecentMessage = { role: string; content: string; createdAt?: Date | string | null };

export type EmotionalAnalysis = {
  intent: "buy" | "inquiry" | "complaint" | "support" | "refund" | "escalation" | "greeting" | "other";
  sentiment: "positive" | "neutral" | "negative" | "angry";
  angerScore: number;
  frustrationScore: number;
  urgencyScore: number;
  confidenceScore: number;
  frustrationLoop: boolean;
  shouldEscalate: boolean;
  shouldCalmFirst: boolean;
  severity: "low" | "medium" | "high" | "critical";
  trigger: string;
  reasons: string[];
  toneHint: string;
};

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));
const norm = (text: string) => String(text || "").toLowerCase().replace(/[إأآا]/g, "ا").replace(/[ىي]/g, "ي").replace(/[ة]/g, "ه").replace(/\s+/g, " ").trim();

const angerWords = [
  "غاضب", "زعلان", "متضايق", "مش عاجب", "مش راضي", "سيء", "سيئ", "وحش", "زفت", "قرف", "حرام", "حراميه", "نصب", "نصاب", "بتستهبل", "استهبل", "مش محترم", "تعبت", "زهقت", "مفيش فايده", "خلاص مش عايز", "bad", "angry", "terrible", "scam", "fraud",
];
const severeWords = [
  "محامي", "قضيه", "بلاغ", "حمايه المستهلك", "شرطه", "نصب", "احتيال", "فضيحه", "هشتكي", "اشتكيت", "complaint", "legal", "lawyer", "police", "chargeback",
];
const refundWords = [
  "استرجاع", "رجع فلوسي", "رجعولي فلوسي", "عايز فلوسي", "استرداد", "refund", "cancel", "الغاء الطلب", "الغاء الاوردر", "فلوسي",
];
const escalationWords = [
  "عاوز اكلم الاداره", "عايز اكلم الاداره", "اكلم الاداره", "كلم الاداره", "المدير", "مدير", "مسؤول", "موظف", "بني ادم", "خدمه عملاء", "human", "manager", "admin", "supervisor",
];
const complaintWords = ["شكوي", "شكوى", "مشكله", "مشكلتي", "اتاخرت", "متاخر", "مش شغال", "مش بيفتح", "غلط", "ليه", "فين", "support", "issue"];
const urgencyWords = ["ضروري", "حالاً", "حالا", "فورا", "بسرعه", "مستعجل", "النهارده", "دلوقتي", "urgent", "asap", "now"];
const positiveWords = ["تمام", "شكرا", "تسلم", "حلو", "ممتاز", "جميل", "عظيم", "موافق", "اوكي", "ok", "thanks", "great"];
const buyWords = ["السعر", "بكام", "اشتري", "اطلب", "اوردر", "طلب", "دفع", "تحويل", "عايز", "عاوز", "احجز", "price", "buy", "order"];
const optOutWords = ["متبعتليش", "متبعتش", "وقف", "الغاء الاشتراك", "stop", "unsubscribe", "don't message", "do not message"];

function hasAny(t: string, words: string[]) {
  return words.some((w) => t.includes(norm(w)));
}

function countAny(t: string, words: string[]) {
  let n = 0;
  for (const w of words) if (t.includes(norm(w))) n++;
  return n;
}

function repeatedPunctuationScore(raw: string): number {
  let s = 0;
  if (/[!؟?]{2,}/.test(raw)) s += 10;
  if (/[A-Z]{8,}/.test(raw)) s += 8;
  if (/(.)\1{5,}/.test(raw)) s += 5;
  return s;
}

function similarity(a: string, b: string): number {
  const as = new Set(norm(a).split(" ").filter((x) => x.length > 1));
  const bs = new Set(norm(b).split(" ").filter((x) => x.length > 1));
  if (!as.size || !bs.size) return 0;
  let inter = 0;
  for (const x of as) if (bs.has(x)) inter++;
  return inter / Math.max(as.size, bs.size);
}

export function isOptOut(text: string): boolean {
  return hasAny(norm(text), optOutWords);
}

export function analyzeCustomerMessage(text: string, opts: {
  recentMessages?: RecentMessage[];
  lastIntent?: string | null;
  lastSentiment?: string | null;
  lowConfidenceThreshold?: number;
} = {}): EmotionalAnalysis {
  const raw = String(text || "").trim();
  const t = norm(raw);
  const recent = opts.recentMessages || [];
  const reasons: string[] = [];

  const severe = hasAny(t, severeWords);
  const refund = hasAny(t, refundWords);
  const explicitEscalation = hasAny(t, escalationWords);
  const complaint = hasAny(t, complaintWords);
  const urgent = hasAny(t, urgencyWords);
  const angerHits = countAny(t, angerWords);
  const positive = hasAny(t, positiveWords);
  const buy = hasAny(t, buyWords);

  let angerScore = angerHits * 22 + repeatedPunctuationScore(raw);
  if (severe) angerScore += 35;
  if (refund) angerScore += 25;
  if (explicitEscalation) angerScore += 25;
  if (complaint) angerScore += 12;
  if (positive && angerScore < 25) angerScore -= 10;

  let urgencyScore = urgent ? 45 : 0;
  if (severe || refund) urgencyScore += 35;
  if (explicitEscalation) urgencyScore += 20;
  if (/[!؟?]{3,}/.test(raw)) urgencyScore += 10;

  const recentUser = recent.filter((m) => m.role === "user").slice(-5);
  const recentAssistant = recent.filter((m) => m.role === "assistant").slice(-5);
  const misunderstandingSignals = ["مش فاهم", "مش فاهمني", "انت مش فاهم", "غلط", "مش ده", "بقولك", "قلتلك", "تاني", "لا مش", "ما هو"];
  const loopTextHits = countAny(t, misunderstandingSignals);
  const lastSimilar = recentUser.some((m) => similarity(m.content, raw) >= 0.78);
  const assistantGap = recentAssistant.some((m) => /لا أعرف|مش متأكد|خارج معلومات|تواصل مع الاداره|تواصل مع الإدارة/.test(m.content));
  const frustrationLoop = loopTextHits >= 1 || (lastSimilar && recentUser.length >= 2) || (assistantGap && complaint);

  let frustrationScore = loopTextHits * 20 + (lastSimilar ? 18 : 0) + (assistantGap ? 15 : 0);
  if (angerScore >= 45) frustrationScore += 20;
  if (recentUser.length >= 3 && complaint) frustrationScore += 12;

  let confidenceScore = 82;
  if (raw.length <= 2) confidenceScore -= 35;
  if (raw.length <= 6 && !buy && !complaint && !positive) confidenceScore -= 20;
  if (frustrationLoop) confidenceScore -= 25;
  if (assistantGap) confidenceScore -= 15;
  if (opts.lastSentiment === "negative" || opts.lastSentiment === "angry") confidenceScore -= 8;
  if (explicitEscalation || refund || severe) confidenceScore = Math.min(confidenceScore, 35);
  if (buy || positive) confidenceScore += 5;

  angerScore = clamp(angerScore);
  urgencyScore = clamp(urgencyScore);
  frustrationScore = clamp(frustrationScore);
  confidenceScore = clamp(confidenceScore);

  let sentiment: EmotionalAnalysis["sentiment"] = "neutral";
  if (angerScore >= 70) sentiment = "angry";
  else if (angerScore >= 35 || complaint || refund) sentiment = "negative";
  else if (positive) sentiment = "positive";

  let intent: EmotionalAnalysis["intent"] = "other";
  if (/^(اهلا|السلام|هاي|hello|hi)\b/.test(t)) intent = "greeting";
  if (buy) intent = "buy";
  if (t.includes("؟") || t.includes("?") || t.includes("ازاي") || t.includes("كيف") || t.includes("هل")) intent = buy ? "buy" : "inquiry";
  if (complaint) intent = "complaint";
  if (refund) intent = "refund";
  if (explicitEscalation) intent = "escalation";

  if (severe) reasons.push("severe_legal_or_abuse_signal");
  if (refund) reasons.push("refund_or_money_back_request");
  if (explicitEscalation) reasons.push("explicit_human_management_request");
  if (angerScore >= 70) reasons.push("high_anger_score");
  if (frustrationLoop) reasons.push("frustration_loop_detected");
  if (confidenceScore <= (opts.lowConfidenceThreshold ?? 35)) reasons.push("low_ai_confidence");

  const critical = severe || (angerScore >= 88 && (refund || explicitEscalation));
  const high = critical || refund || explicitEscalation || angerScore >= 78 || (frustrationLoop && angerScore >= 55);
  const medium = high || angerScore >= 45 || complaint || confidenceScore <= (opts.lowConfidenceThreshold ?? 35);

  const shouldEscalate = critical || high || (frustrationLoop && confidenceScore <= (opts.lowConfidenceThreshold ?? 35));
  const shouldCalmFirst = !shouldEscalate && medium;

  const severity: EmotionalAnalysis["severity"] = critical ? "critical" : high ? "high" : medium ? "medium" : "low";
  const trigger = reasons[0] || (shouldCalmFirst ? "calm_first_negative_tone" : "none");
  const toneHint = buildToneHint({ sentiment, angerScore, frustrationScore, urgencyScore, shouldEscalate, shouldCalmFirst });

  return {
    intent,
    sentiment,
    angerScore,
    frustrationScore,
    urgencyScore,
    confidenceScore,
    frustrationLoop,
    shouldEscalate,
    shouldCalmFirst,
    severity,
    trigger,
    reasons,
    toneHint,
  };
}

function buildToneHint(a: Pick<EmotionalAnalysis, "sentiment" | "angerScore" | "frustrationScore" | "urgencyScore" | "shouldEscalate" | "shouldCalmFirst">): string {
  if (a.shouldEscalate) {
    return "العميل متضايق أو يحتاج تدخل بشري. رد بهدوء شديد، اعترف بالمشكلة، لا تجادل، لا تكثر كلام، ولا تعد بتفاصيل غير مؤكدة.";
  }
  if (a.shouldCalmFirst || a.sentiment === "negative") {
    return "نبرة العميل سلبية. ابدأ بتعاطف قصير طبيعي، ثم قدم حل/سؤال واحد واضح. لا تستخدم عبارات روبوتية أو اعتذار طويل.";
  }
  if (a.urgencyScore >= 50) {
    return "العميل مستعجل. اختصر الرد جداً وقدم الخطوة التالية مباشرة.";
  }
  return "اكتب برد طبيعي مختصر، بدون مبالغة أو تكرار تحيات.";
}

export function emotionalPromptBlock(a: EmotionalAnalysis): string {
  return [
    "--- قراءة نبرة العميل (استخدمها لتعديل الأسلوب فقط) ---",
    `sentiment=${a.sentiment}; intent=${a.intent}; anger=${a.angerScore}/100; frustration=${a.frustrationScore}/100; urgency=${a.urgencyScore}/100; confidence=${a.confidenceScore}/100`,
    a.toneHint,
    "قواعد النبرة: لا تكن رسمياً زيادة؛ لا تطيل؛ لا تكرر كلمة آسف أكثر من مرة؛ لو مش متأكد اسأل سؤال توضيح واحد.",
    "--- نهاية قراءة النبرة ---",
  ].join("\n");
}

export function customerEscalationReply(a: EmotionalAnalysis): string {
  if (a.severity === "critical" || a.intent === "refund") {
    return "فاهمك، وحقك الموضوع يتراجع بجدية. سجّلت الحالة حالاً للفريق المسؤول وهيتم التعامل معاها كأولوية. ممكن تبعتلي رقم الطلب أو آخر تفاصيل الدفع عشان نوصل للحل أسرع؟";
  }
  if (a.intent === "escalation") {
    return "حاضر، سجّلت طلبك للتواصل مع الإدارة. لحد ما حد من الفريق يمسك المحادثة، ابعتلي آخر تفاصيل المشكلة في رسالة واحدة عشان نوفر وقتك.";
  }
  return "فاهم إن الموضوع مزعلك. خليني أحاول أحله معاك بهدوء: ابعتلي آخر تفصيلة أو رقم الطلب، ولو محتاج تدخل بشري هيتسجل للفريق فوراً.";
}
