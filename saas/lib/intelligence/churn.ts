// AI Intelligence Layer — Churn probability + Sentiment trend.
//
// The schema already stores `Customer.churnRiskScore`, `retentionScore`,
// `loyaltyScore`, recency timestamps, and `CustomerMemory.sentimentHistory`
// (last 10 sentiments). Today churnRiskScore is the only churn signal and the
// sentiment history has ZERO consumers. This module turns those into:
//   • a continuous churn probability (0-100) blending recency + engagement +
//     hesitation + the stored churnRiskScore, and
//   • a sentiment trend vector (improving | declining | stable) read from the
//     stored history.
// Pure functions — no writes, no schema change.

import type { SentimentTrend } from "./types";

// ---------------------------------------------------------------------------
// Churn probability
// ---------------------------------------------------------------------------

export interface ChurnInput {
  churnRiskScore: number; // existing stored field (may be 0 / unmaintained)
  retentionScore: number; // existing stored field (default 50)
  loyaltyScore: number;
  daysSinceLastInbound: number; // recency
  orderCount: number;
  hesitationScore: number;
}

// Returns 0-100. Higher = more likely to lapse. Blends the stored churnRiskScore
// (when present) with live recency/engagement so a freshly-active loyal buyer is
// never flagged, and a long-silent one-time buyer is.
export function computeChurnProbability(i: ChurnInput): number {
  let s = 0;

  // Recency is the dominant churn driver for conversational commerce.
  const d = Math.max(0, i.daysSinceLastInbound || 0);
  if (d >= 60) s += 45;
  else if (d >= 30) s += 32;
  else if (d >= 14) s += 20;
  else if (d >= 7) s += 10;
  else if (d >= 3) s += 4;

  // Retention score is an inverse signal (high retention → low churn).
  s += Math.round((100 - clamp(i.retentionScore, 0, 100)) * 0.2); // up to +20

  // Loyalty (repeat purchasing) is protective.
  s -= Math.round(clamp(i.loyaltyScore, 0, 100) * 0.15); // up to -15

  // Hesitation slightly raises churn risk (unresolved doubt).
  s += Math.round(clamp(i.hesitationScore, 0, 100) * 0.1); // up to +10

  // Blend in the stored churnRiskScore when the pipeline has set it.
  if (i.churnRiskScore > 0) s = Math.round(s * 0.6 + i.churnRiskScore * 0.4);

  // One-time buyers who went quiet are the classic at-risk segment.
  if (i.orderCount === 1 && d >= 21) s += 8;
  // Never-bought leads can't "churn" in the revenue sense — cap their score.
  if (i.orderCount === 0) s = Math.min(s, 60);

  return clamp(Math.round(s), 0, 100);
}

export type ChurnBand = "safe" | "watch" | "at_risk" | "critical";

export function churnBand(prob: number): ChurnBand {
  if (prob >= 75) return "critical";
  if (prob >= 55) return "at_risk";
  if (prob >= 35) return "watch";
  return "safe";
}

const CHURN_BAND_LABEL: Record<ChurnBand, string> = {
  safe: "آمن",
  watch: "تحت المتابعة",
  at_risk: "معرّض للفقدان",
  critical: "خطر فقدان عالٍ",
};

export function churnBandLabel(band: ChurnBand): string {
  return CHURN_BAND_LABEL[band];
}

// ---------------------------------------------------------------------------
// Sentiment trend — reads CustomerMemory.sentimentHistory (last 10).
// Stored shape: [{ s: "positive", ts: 1234 }, ...] (see lib/memory.ts).
// ---------------------------------------------------------------------------

const SENTIMENT_WEIGHT: Record<string, number> = {
  positive: 1,
  neutral: 0,
  negative: -1,
  angry: -2,
};

export function computeSentimentTrend(
  sentimentHistoryJson: string | null | undefined,
): SentimentTrend {
  let history: Array<{ s?: string; ts?: number }> = [];
  try {
    const parsed = JSON.parse(sentimentHistoryJson || "[]");
    if (Array.isArray(parsed)) history = parsed;
  } catch {
    return "unknown";
  }
  const seq = history
    .map((h) => (typeof h?.s === "string" ? SENTIMENT_WEIGHT[h.s] ?? 0 : 0))
    .filter((n) => Number.isFinite(n));

  if (seq.length < 3) return "unknown";

  // Compare the average of the most recent half vs the older half.
  const mid = Math.floor(seq.length / 2);
  const older = seq.slice(0, mid);
  const recent = seq.slice(mid);
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const delta = avg(recent) - avg(older);

  if (delta >= 0.5) return "improving";
  if (delta <= -0.5) return "declining";
  return "stable";
}

const TREND_LABEL: Record<SentimentTrend, string> = {
  improving: "المزاج يتحسّن",
  declining: "المزاج يسوء",
  stable: "المزاج ثابت",
  unknown: "غير معروف",
};

export function sentimentTrendLabel(t: SentimentTrend): string {
  return TREND_LABEL[t];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : 0));
}
