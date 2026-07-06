// AI Intelligence Layer — Unified Next Best Action (NBA) engine.
//
// THE GAP THIS CLOSES (see audit): KEYONE already computes every input signal —
// conversionScore, hesitationScore, churnRiskScore, psychology (via signals),
// objections, negotiation state, recency. But the "what should the merchant do
// about THIS customer right now" decision was scattered across chooseMode()
// (bot tone), selectCta() (CTA hint), and suggestFollowUp() (timing). No single
// per-customer merchant action with a confidence existed.
//
// This module FUSES those existing signals into ONE decision: an NbaAction, a
// confidence (0-100), and a ready-to-paste Arabic message. Pure function — it
// reads inputs the pipeline already produced; it does not recompute scores and
// does not write anything.

import type { NbaAction, NbaFactor, NbaInputs, NbaResult } from "./types";
import { valueTierWeight } from "./value-tier";

// ---------------------------------------------------------------------------
// Decision tree. Ordered by urgency/severity — first match wins. Each branch
// also yields a confidence derived from how strongly its signals fired, so the
// merchant can triage (act on high-confidence first).
// ---------------------------------------------------------------------------

export function decideNextBestAction(i: NbaInputs): NbaResult {
  const obj = i.objections || {};
  const sentiment = (i.lastSentiment || "").toLowerCase();
  const intent = (i.lastIntent || "").toLowerCase();

  // 1) Frustration / explicit escalation → get a human in. Revenue protection.
  if (i.frustrationScore >= 65 || sentiment === "angry" || intent === "escalation" || intent === "complaint") {
    const conf = clamp(60 + Math.round(i.frustrationScore * 0.35), 0, 98);
    return finalize(i, {
      action: "escalate",
      confidence: conf,
      title: "العميل متضايق — يحتاج تدخل بشري",
      reason: `إشارات إحباط عالية${sentiment === "angry" ? " ونبرة غاضبة" : ""} — تدخّل سريع يحمي العلاقة.`,
      suggestedMessage: msgEscalate(i),
    });
  }

  // 2) Awaiting a reply on a hot question → answer fast (speed = conversion).
  if (i.awaitingReply && (i.conversionScore >= 45 || intent === "buy" || intent === "inquiry")) {
    const conf = clamp(55 + Math.round(i.conversionScore * 0.4), 0, 95);
    return finalize(i, {
      action: "answer_fast",
      confidence: conf,
      title: "بينتظر ردك الآن",
      reason: `آخر رسالة من العميل بدون رد${intent === "buy" ? " ونية شراء" : ""} — السرعة دلوقتي بتفرق.`,
      suggestedMessage: msgAnswerFast(i),
    });
  }

  // 3) Ready to buy → ask for the order (highest-intent close).
  if (i.conversionScore >= 70 && i.hesitationScore < 45 && !obj.trust) {
    const conf = clamp(60 + Math.round((i.conversionScore - 60) * 1.2), 0, 96);
    return finalize(i, {
      action: "close_now",
      confidence: conf,
      title: "جاهز للشراء — اقفل الصفقة",
      reason: `احتمال تحويل ${i.conversionScore}% وتردد منخفض — اطلب تأكيد الطلب مباشرة.`,
      suggestedMessage: msgCloseNow(i),
    });
  }

  // 4) Trust objection → reassure first (trust blocks everything downstream).
  if (obj.trust) {
    return finalize(i, {
      action: "build_trust",
      confidence: 72,
      title: "عنده قلق من الثقة",
      reason: "ظهرت إشارات عدم ثقة — ضمان/تجربة عميل/دفع عند الاستلام بيطمّنه.",
      suggestedMessage: msgBuildTrust(i),
    });
  }

  // 5) Price-sensitive (objection or repeated discount asks) → anchor on value.
  if (obj.price || (i.discountAsks || 0) >= 2) {
    const conf = clamp(58 + (i.discountAsks || 0) * 6, 0, 88);
    return finalize(i, {
      action: "offer_value",
      confidence: conf,
      title: "حسّاس للسعر",
      reason: `اعتراض سعر${(i.discountAsks || 0) >= 2 ? ` وطلب خصم ${i.discountAsks} مرات` : ""} — ركّز على القيمة مش الخصم المباشر.`,
      suggestedMessage: msgOfferValue(i),
    });
  }

  // 6) Just bought (recent buyer, fresh) → upsell a complement.
  // Product-framed advice: only when the tenant sells products. When products
  // is OFF (Software/Services vertical) fall through to the next branch. Guard
  // is backward-compatible — undefined productsEnabled means ON (Store default).
  if (
    i.productsEnabled !== false &&
    i.orderCount >= 1 &&
    i.daysSinceLastInbound <= 7 &&
    i.churnRiskScore < 40 &&
    intent !== "complaint"
  ) {
    return finalize(i, {
      action: "upsell",
      confidence: 64,
      title: "اشترى مؤخراً — فرصة بيع مكمّل",
      reason: "عميل نشط واشترى مؤخراً — اقتراح منتج مكمّل واحد بيرفع قيمة الطلب.",
      suggestedMessage: msgUpsell(i),
    });
  }

  // 7) Lapsed past buyer → win-back (value-weighted; protect LTV).
  if (i.orderCount >= 1 && i.daysSinceLastInbound >= 14) {
    const conf = clamp(50 + Math.round(i.churnRiskScore * 0.35), 0, 90);
    return finalize(i, {
      action: "win_back",
      confidence: conf,
      title: "عميل سابق ابتعد — استعِده",
      reason: `اشترى قبل كده وغاب ${i.daysSinceLastInbound} يوم — رسالة استعادة مخصّصة دلوقتي مهمة.`,
      suggestedMessage: msgWinBack(i),
    });
  }

  // 8) Hesitant but warm → reduce friction (remove ONE blocker).
  if (i.hesitationScore >= 45 && i.conversionScore >= 30) {
    const conf = clamp(50 + Math.round(i.conversionScore * 0.3), 0, 85);
    return finalize(i, {
      action: "reduce_friction",
      confidence: conf,
      title: "مهتم لكنه متردد",
      reason: `تردد ${i.hesitationScore}% مع اهتمام واضح — شيل عائق واحد بسؤال أو توضيح بسيط.`,
      suggestedMessage: msgReduceFriction(i),
    });
  }

  // 9) Went quiet after interest → gentle nudge.
  if (i.daysSinceLastInbound >= 2 && i.daysSinceLastInbound < 14 && i.leadScore >= 35 && i.orderCount === 0) {
    const conf = clamp(40 + Math.round(i.leadScore * 0.3), 0, 80);
    return finalize(i, {
      action: "nudge_followup",
      confidence: conf,
      title: "كان مهتم ثم سكت — تابِعه",
      reason: `اهتمام سابق (${i.leadScore} نقطة) وسكوت ${i.daysSinceLastInbound} يوم — متابعة لطيفة دلوقتي.`,
      suggestedMessage: msgNudge(i),
    });
  }

  // 10) Some signal but nothing urgent → nurture / keep warm.
  if (i.leadScore >= 20 || i.conversionScore >= 20) {
    return finalize(i, {
      action: "nurture",
      confidence: 38,
      title: "إشارة خفيفة — خلّيه دافي",
      reason: "اهتمام مبدئي بدون نية قوية — تواصل خفيف بدون ضغط بيحافظ على العلاقة.",
      suggestedMessage: msgNurture(i),
    });
  }

  // 11) Nothing actionable.
  return finalize(i, {
    action: "hold",
    confidence: 20,
    title: "لا يوجد إجراء عاجل",
    reason: "إشارات غير كافية لإجراء بيعي الآن — راقب أي رسالة جديدة.",
    suggestedMessage: "",
  });
}

// ---------------------------------------------------------------------------
// Priority = how high this opportunity should sit in the merchant's worklist.
// Blends confidence (how sure), value tier (how much it's worth), and urgency
// implied by the action. This is what the Revenue Copilot ranking sorts by.
// ---------------------------------------------------------------------------

const ACTION_URGENCY: Record<NbaAction, number> = {
  escalate: 100,
  answer_fast: 92,
  close_now: 88,
  build_trust: 70,
  offer_value: 66,
  upsell: 58,
  win_back: 60,
  reduce_friction: 54,
  nudge_followup: 46,
  nurture: 24,
  hold: 8,
};

function finalize(i: NbaInputs, partial: Omit<NbaResult, "priority" | "factors">): NbaResult {
  const urgency = ACTION_URGENCY[partial.action];
  const tierW = valueTierWeight(i.valueTier);
  // priority blends urgency (0-100), confidence (0-100) and value weight (0.8-2).
  const priority = clamp(
    Math.round(urgency * 0.55 + partial.confidence * 0.25 + (tierW / 2) * 100 * 0.2),
    0,
    100,
  );
  const factors = buildFactors(i, partial.action);
  return { ...partial, priority, factors };
}

function buildFactors(i: NbaInputs, action: NbaAction): NbaFactor[] {
  const f: NbaFactor[] = [];

  // Lead / conversion scores
  if (i.conversionScore >= 45) {
    f.push({ signal: "conversionScore", value: String(i.conversionScore), weight: i.conversionScore >= 70 ? "high" : "medium", labelAr: `احتمال التحويل ${i.conversionScore}%` });
  }
  if (i.leadScore >= 35) {
    f.push({ signal: "leadScore", value: String(i.leadScore), weight: i.leadScore >= 60 ? "high" : "medium", labelAr: `درجة الاهتمام ${i.leadScore}%` });
  }
  if (i.hesitationScore >= 35) {
    f.push({ signal: "hesitationScore", value: String(i.hesitationScore), weight: i.hesitationScore >= 60 ? "high" : "medium", labelAr: `مستوى التردد ${i.hesitationScore}%` });
  }
  if (i.frustrationScore >= 40) {
    f.push({ signal: "frustrationScore", value: String(i.frustrationScore), weight: i.frustrationScore >= 65 ? "high" : "medium", labelAr: `مستوى الإحباط ${i.frustrationScore}%` });
  }
  if (i.churnRiskScore >= 35) {
    f.push({ signal: "churnRiskScore", value: String(i.churnRiskScore), weight: i.churnRiskScore >= 55 ? "high" : "medium", labelAr: `خطر الفقدان ${i.churnRiskScore}%` });
  }

  // Contextual signals
  if (i.awaitingReply) {
    f.push({ signal: "awaitingReply", value: "true", weight: "high", labelAr: "بينتظر ردك" });
  }
  if (i.orderCount >= 1) {
    f.push({ signal: "orderCount", value: String(i.orderCount), weight: "medium", labelAr: `اشترى ${i.orderCount} مرة` });
  }
  if (i.daysSinceLastInbound <= 1 && action !== "win_back") {
    f.push({ signal: "recency", value: `${i.daysSinceLastInbound}d`, weight: "medium", labelAr: "تواصل حديث" });
  }
  if (i.daysSinceLastInbound >= 14) {
    f.push({ signal: "recency", value: `${i.daysSinceLastInbound}d`, weight: "high", labelAr: `غاب ${i.daysSinceLastInbound} يوم` });
  }

  // Objection signals
  const obj = i.objections || {};
  if (obj.price) f.push({ signal: "objection.price", value: "true", weight: "high", labelAr: "اعتراض السعر" });
  if (obj.trust) f.push({ signal: "objection.trust", value: "true", weight: "high", labelAr: "اعتراض الثقة" });
  if (obj.shipping) f.push({ signal: "objection.shipping", value: "true", weight: "medium", labelAr: "اعتراض الشحن" });
  if ((i.discountAsks || 0) >= 2) {
    f.push({ signal: "discountAsks", value: String(i.discountAsks), weight: "medium", labelAr: `طلب خصم ${i.discountAsks} مرات` });
  }

  // Intent / sentiment
  if (i.lastIntent === "buy") f.push({ signal: "intent", value: "buy", weight: "high", labelAr: "نية شراء واضحة" });
  if (i.lastSentiment === "angry") f.push({ signal: "sentiment", value: "angry", weight: "high", labelAr: "مشاعر غضب" });
  if (i.lastSentiment === "negative") f.push({ signal: "sentiment", value: "negative", weight: "medium", labelAr: "مشاعر سلبية" });

  // Value tier
  if (i.valueTier !== "lead") {
    const tierLabel: Record<string, string> = { platinum: "بلاتيني", gold: "ذهبي", silver: "فضي", bronze: "برونزي" };
    f.push({ signal: "valueTier", value: i.valueTier, weight: i.valueTier === "platinum" || i.valueTier === "gold" ? "high" : "low", labelAr: `فئة العميل: ${tierLabel[i.valueTier] || i.valueTier}` });
  }

  // Sort: high first, then cap at 5 so the expander stays readable.
  const order = { high: 0, medium: 1, low: 2 };
  return f.sort((a, b) => order[a.weight] - order[b.weight]).slice(0, 5);
}

// ---------------------------------------------------------------------------
// Message templates — soft, Arabic, ready to paste. Never pushy. The merchant
// always sends manually (anti-ban-safe by design, like the intel detectors).
// ---------------------------------------------------------------------------

function greet(name?: string | null): string {
  return name ? `أهلاً ${name}،` : "أهلاً،";
}

function msgEscalate(i: NbaInputs): string {
  return `${greet(i.customerName)} أنا آسف لو حصل أي إزعاج. خليني أساعدك أحل الموضوع بسرعة — ممكن توضّحلي آخر تفصيلة وأنا هتابعها معاك شخصياً لحد ما تتظبط.`;
}
function msgAnswerFast(i: NbaInputs): string {
  return `${greet(i.customerName)} وصلتني رسالتك ✅. خليني أجاوبك على طول — تحب أبدأ بأنهي نقطة، السعر ولا التفاصيل؟`;
}
function msgCloseNow(i: NbaInputs): string {
  return `${greet(i.customerName)} تمام، كل حاجة جاهزة 🙌. ابعتلي الاسم والعنوان ورقم التواصل وأنا أأكد طلبك دلوقتي.`;
}
function msgBuildTrust(i: NbaInputs): string {
  return `${greet(i.customerName)} أطمنك إن ده اختيار مضمون — عندنا عملاء كتير جربوه وكانوا مبسوطين، ومتاح الدفع عند الاستلام لو أنسب ليك. تحب أبعتلك تفاصيل الضمان؟`;
}
function msgOfferValue(i: NbaInputs): string {
  return `${greet(i.customerName)} أنا فاهم إن السعر مهم. خليني أوريك القيمة اللي هتاخدها بالظبط مقابل ده — وممكن أرشحلك الخيار الأنسب لميزانيتك من غير ما تتنازل عن الجودة.`;
}
function msgUpsell(i: NbaInputs): string {
  return `${greet(i.customerName)} شكراً لطلبك الأخير 🙏. عندي حاجة واحدة بتكمّل اللي اشتريته وكتير من العملاء بياخدوها معاه — تحب أبعتلك تفاصيلها؟`;
}
function msgWinBack(i: NbaInputs): string {
  return `${greet(i.customerName)} وحشتنا 🌟. عملنا حاجات جديدة من آخر مرة اتكلمنا، وحبيت أطمن عليك وأشوف لو في حاجة أقدر أساعدك فيها دلوقتي.`;
}
function msgReduceFriction(i: NbaInputs): string {
  return `${greet(i.customerName)} خد وقتك، أنا موجود لأي سؤال. لو في نقطة واحدة بس مخلياك متردد، قولهالي وأوضحهالك في ثانية.`;
}
function msgNudge(i: NbaInputs): string {
  return `${greet(i.customerName)} حبيت أتابع معاك بخصوص اللي كنت مهتم بيه. لسه متاح ولو حابب أساعدك تكمل أنا جاهز.`;
}
function msgNurture(i: NbaInputs): string {
  return `${greet(i.customerName)} أنا هنا لو احتجت أي مساعدة أو ترشيح يناسبك. تحب أعرفك بأكتر حاجة بتناسب اهتمامك؟`;
}

const ACTION_LABEL: Record<NbaAction, string> = {
  close_now: "اقفل الصفقة",
  offer_value: "اعرض القيمة",
  build_trust: "ابنِ الثقة",
  reduce_friction: "قلّل التردد",
  answer_fast: "رد بسرعة",
  nudge_followup: "متابعة لطيفة",
  win_back: "استعادة عميل",
  upsell: "بيع مكمّل",
  escalate: "تصعيد لإنسان",
  nurture: "تنمية العلاقة",
  hold: "انتظار",
};

export function nbaActionLabel(a: NbaAction): string {
  return ACTION_LABEL[a];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? Math.round(n) : min));
}
