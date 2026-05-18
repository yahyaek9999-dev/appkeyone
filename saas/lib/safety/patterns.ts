// Anti-Pattern Detector — looks for spam-bot tells in the bot's recent
// outbound stream. Inputs are pulled from SafetyEvent (replyHash + counts).
// The output is a list of detected patterns + a numeric weight that the
// risk engine adds to its score.
//
// Cheap to run: O(N) over recent reply hashes only. Designed for the hot
// path; avoids loading message text.

export interface PatternHit {
  name: string;
  weight: number;     // points to add to risk score
  detail: string;
}

export interface PatternInput {
  /** Recent reply hashes, newest first, at most ~20 entries. */
  recentReplyHashes: string[];
  /** Customer's current message hash (computed by the engine). */
  currentReplyHash: string;
  /** Sends in the last 1 / 10 / 60 minutes. */
  sends1Min: number;
  sends10Min: number;
  sends1Hour: number;
  /** Inbound vs outbound count over the last hour. */
  inboundCount1H: number;
  outboundCount1H: number;
  /** Number of unique recipients seen in last 10 min. */
  uniqueRecipients10Min: number;
  /** Hour of day in server local time. */
  hourOfDay: number;
}

export function detectPatterns(i: PatternInput): PatternHit[] {
  const hits: PatternHit[] = [];

  // 1) Exact repetition. Raised threshold; short replies legitimately repeat.
  const dupCount = i.recentReplyHashes.filter((h) => h === i.currentReplyHash).length;
  if (dupCount >= 5) {
    hits.push({ name: "exact_repetition_x5", weight: 22,
      detail: `نفس الرد تكرر ${dupCount} مرات` });
  } else if (dupCount >= 4) {
    hits.push({ name: "exact_repetition_x4", weight: 10,
      detail: `نفس الرد تكرر ${dupCount} مرات` });
  }

  // 2) Fanout WITHOUT inbound interest. Stricter: needs both wide fanout
  //    AND meaningful outbound volume to avoid flagging small legit broadcasts.
  if (
    i.uniqueRecipients10Min >= 12 &&
    i.outboundCount1H >= 15 &&
    i.inboundCount1H < i.outboundCount1H * 0.2
  ) {
    hits.push({ name: "fanout_low_inbound", weight: 20,
      detail: `${i.uniqueRecipients10Min} عملاء بتفاعل وارد ضعيف` });
  }

  // 3) Outbound dominance. Only fires when there's serious volume AND the
  //    ratio is severely lopsided (5:1+). Healthy chat goes 1:1 to 2:1.
  if (i.outboundCount1H >= 25 && i.inboundCount1H * 5 < i.outboundCount1H) {
    hits.push({ name: "outbound_imbalance", weight: 14,
      detail: `إرسال ${i.outboundCount1H} مقابل استلام ${i.inboundCount1H}` });
  }

  // 4) Burst sending. Tighter floor (12/min) so normal busy hours pass.
  if (i.sends1Min >= 12) {
    hits.push({ name: "minute_burst", weight: 22,
      detail: `${i.sends1Min} رسائل في الدقيقة الأخيرة` });
  }
  if (i.sends10Min >= 70) {
    hits.push({ name: "ten_min_burst", weight: 14,
      detail: `${i.sends10Min} رسالة في 10 دقائق` });
  }

  // 5) Night-time spam pattern. Now also requires LOW inbound — a customer
  //    chatting at 3am with the bot is fine, mass outbound at 3am is not.
  if (
    i.hourOfDay >= 1 && i.hourOfDay <= 5 &&
    i.sends1Hour >= 10 &&
    i.inboundCount1H < i.sends1Hour * 0.3
  ) {
    hits.push({ name: "night_spam_pattern", weight: 14,
      detail: `إرسال نشط في ساعات النوم بتفاعل ضعيف` });
  }

  // 6) Repetitive template. Stricter window + ratio.
  if (i.recentReplyHashes.length >= 8) {
    const distinct = new Set(i.recentReplyHashes).size;
    const dupRatio = 1 - distinct / i.recentReplyHashes.length;
    if (dupRatio >= 0.7) {
      hits.push({ name: "template_overuse", weight: 16,
        detail: `${Math.round(dupRatio * 100)}% من الردود متكررة` });
    } else if (dupRatio >= 0.5) {
      hits.push({ name: "template_pattern", weight: 6,
        detail: `${Math.round(dupRatio * 100)}% من الردود متشابهة` });
    }
  }

  return hits;
}

/** Sum of weights — the engine adds this to its rolling risk score. */
export function totalPatternWeight(hits: PatternHit[]): number {
  return hits.reduce((s, h) => s + h.weight, 0);
}
