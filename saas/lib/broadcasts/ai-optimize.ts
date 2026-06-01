// Advanced Broadcast AI — campaign optimizer (mostly data-driven + 1 LLM call).
//
// Returns concrete, evidence-backed suggestions for a campaign: best send time
// (from inbound activity), message length guidance, 3 CTA options (LLM, via the
// merchant's provider — same pattern as the generate route), the best segment
// to target (highest historical conversion), follow-up timing, and an expected
// conversion estimate. Read-only; never sends anything.

import { prisma } from "@/lib/db";
import { chat as llmChat } from "@/lib/llm";
import { botProviderOverride } from "@/lib/providers/bot-provider";
import { computeSegments } from "@/lib/analytics/segments";
import { getOrderRollup } from "@/lib/analytics/order-rollup";

const DAY = 86_400_000;

export interface OptimizeResult {
  bestSendTime: { label: string; topHours: number[] };
  messageLength: { current: number; idealMin: number; idealMax: number; verdict: string };
  ctas: string[];
  bestSegment: { key: string; label: string; conversionPct: number; count: number } | null;
  followUpTiming: string;
  expectedConversionPct: number;
  expectedBasis: string;
}

const FALLBACK_CTAS = ["اطلب دلوقتي قبل نفاد الكمية 🔥", "رد بكلمة (تمام) ونكمّل طلبك 👌", "العرض محدود — احجز مكانك النهاردة"];

function lengthVerdict(len: number): string {
  if (len === 0) return "اكتب رسالة بين ٢-٤ جمل قصيرة (≈120–280 حرف) لأعلى تفاعل.";
  if (len < 80) return "الرسالة قصيرة جدًا — أضف قيمة واضحة ودعوة للفعل.";
  if (len <= 320) return "طول مثالي — مختصر وواضح، أعلى معدلات الرد عادةً هنا.";
  if (len <= 600) return "أطول من المثالي قليلًا — اختصر للجملة الأهم.";
  return "طويلة جدًا — قسّمها أو احذف التفاصيل الثانوية لرفع نسبة القراءة.";
}

export async function optimizeCampaign(
  userId: string,
  input: { template?: string; audience?: string; product?: string; offer?: string },
): Promise<OptimizeResult> {
  const now = new Date();
  const since = new Date(now.getTime() - 30 * DAY);
  const template = String(input.template || "");

  const [hourRows, segData, rollup, bot] = await Promise.all([
    prisma.message.findMany({
      where: { role: "user", createdAt: { gte: since }, conversation: { customer: { userId } } },
      select: { createdAt: true },
      take: 6000,
    }),
    computeSegments(userId).catch(() => null),
    getOrderRollup(userId, { now }),
    prisma.bot.findUnique({ where: { userId } }).catch(() => null),
  ]);

  // ---- Best send time (inbound activity histogram, server-local hours) ----
  const hist = new Array(24).fill(0);
  for (const m of hourRows) hist[new Date(m.createdAt).getHours()]++;
  const topHours = hist
    .map((c, h) => ({ h, c }))
    .sort((a, b) => b.c - a.c)
    .slice(0, 3)
    .filter((x) => x.c > 0)
    .map((x) => x.h)
    .sort((a, b) => a - b);
  const bestSendTime = {
    topHours,
    label:
      topHours.length > 0
        ? `أكثر أوقات نشاط عملائك: ${topHours.map((h) => `${String(h).padStart(2, "0")}:00`).join("، ")}`
        : "لا توجد بيانات نشاط كافية بعد — جرّب المساء (19:00–22:00).",
  };

  // ---- Best segment (highest conversion with a meaningful size) ----
  let bestSegment: OptimizeResult["bestSegment"] = null;
  if (segData) {
    for (const s of segData.segments) {
      if (s.count < 3) continue;
      if (!bestSegment || s.conversionPct > bestSegment.conversionPct) {
        bestSegment = { key: s.key, label: s.label, conversionPct: s.conversionPct, count: s.count };
      }
    }
  }

  // ---- Expected conversion estimate ----
  const totalCustomers = segData?.totalCustomers || 0;
  const baseline = totalCustomers > 0 ? Math.round((rollup.totals.customersWithPaidOrders / totalCustomers) * 1000) / 10 : 0;
  let expectedConversionPct = baseline;
  let expectedBasis = `متوسط التحويل العام لحسابك (${baseline}%).`;
  const aud = String(input.audience || "");
  if (aud.startsWith("segment:") && segData) {
    const key = aud.slice("segment:".length);
    const seg = segData.segments.find((s) => s.key === key);
    if (seg) {
      expectedConversionPct = seg.conversionPct;
      expectedBasis = `بناءً على نسبة شراء شريحة «${seg.label}» (${seg.conversionPct}%).`;
    }
  }
  // Nudge up for warmer audiences, down for cold ones (bounded).
  if (/hot|buyers/.test(aud)) expectedConversionPct = Math.min(100, expectedConversionPct + 5);
  if (/inactive|no_purchase|cold/.test(aud)) expectedConversionPct = Math.max(0, expectedConversionPct - 2);

  // ---- CTA options (1 bounded LLM call, graceful fallback) ----
  let ctas = FALLBACK_CTAS;
  try {
    const sys =
      "أنت خبير كتابة دعوات فعل (CTA) تسويقية بالعامية المصرية لواتساب. " +
      "أعد 3 دعوات فعل قصيرة فقط، كل واحدة في سطر يبدأ بـ '- '، بدون شرح، إيموجي واحد كحد أقصى لكل سطر.";
    const ctx = [
      input.product ? `المنتج: ${input.product}` : "",
      input.offer ? `العرض: ${input.offer}` : "",
      template ? `الرسالة الحالية: ${template.slice(0, 400)}` : "",
    ].filter(Boolean).join("\n") || "حملة تسويقية عامة.";
    const raw = await llmChat(
      [
        { role: "system", content: sys },
        { role: "user", content: `اقترح 3 دعوات فعل قوية لـ:\n${ctx}` },
      ],
      { temperature: 0.8, maxTokens: 160, provider: botProviderOverride(bot), meterUserId: userId },
    );
    const parsed = String(raw || "")
      .split("\n")
      .map((l) => l.replace(/^[-*•\d.\s]+/, "").trim())
      .filter((l) => l.length > 0)
      .slice(0, 3);
    if (parsed.length >= 2) ctas = parsed;
  } catch {
    // keep fallback CTAs
  }

  return {
    bestSendTime,
    messageLength: { current: template.length, idealMin: 120, idealMax: 320, verdict: lengthVerdict(template.length) },
    ctas,
    bestSegment,
    followUpTiming: "أرسل متابعة بعد 48–72 ساعة لمن لم يردّوا (تجنّب نفس اليوم).",
    expectedConversionPct,
    expectedBasis,
  };
}
