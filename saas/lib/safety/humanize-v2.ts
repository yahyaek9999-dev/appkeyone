// Humanize V2 — extends humanize.ts with deeper realism:
//   * timezone-aware activity (sleep, lunch, prayer breaks)
//   * micro-typos with optional self-correction
//   * variable typing speed band (slow / normal / fast operators)
//   * punctuation jitter
//   * response-length variability hints
//
// All knobs probabilistic and conservative: most replies still feel like
// the existing humanize layer, with occasional "human flourishes" added.

export type DayPart = "sleep" | "early_morning" | "morning" | "midday" | "afternoon" | "evening" | "night";

export interface HumanizeV2Result {
  text: string;
  preDelayMs: number;     // time before "typing..." appears
  typingDelayMs: number;  // time the indicator stays on
  silentSkip?: boolean;   // bot decided to stay silent (sleep window) — caller may queue
  reason?: string;
}

export interface HumanizeV2Options {
  /** Customer's local hour 0..23 if known; else server hour. */
  localHour?: number;
  /** Skip realism for VIP customers (still applies the existing humanize). */
  vipShortcut?: boolean;
  /** Length of the customer's last message. Short msgs get short replies. */
  inboundLen?: number;
  /** Higher value = bot can take more liberties (typos, casual style). */
  casualness?: number; // 0..1, default 0.4
  /** Bot's claimed working hours (if set, sleep window comes from there). */
  workingHours?: { from: number; to: number } | null;
}

export function classifyHour(h: number): DayPart {
  if (h >= 0 && h <= 5) return "sleep";
  if (h === 6 || h === 7) return "early_morning";
  if (h >= 8 && h <= 11) return "morning";
  if (h >= 12 && h <= 14) return "midday";
  if (h >= 15 && h <= 17) return "afternoon";
  if (h >= 18 && h <= 21) return "evening";
  return "night";
}

/** Multiplier applied to humanize delays based on time-of-day. */
export function timeOfDayDelayFactor(part: DayPart): number {
  switch (part) {
    case "sleep":          return 3.0; // bot drowsy / not really there
    case "early_morning":  return 1.6;
    case "morning":        return 1.0;
    case "midday":         return 1.25; // lunch / prayer Dhuhr
    case "afternoon":      return 1.0;
    case "evening":        return 1.05;
    case "night":          return 1.4;
  }
}

/** Should the bot stay silent right now? Only true in deep sleep window. */
export function shouldStaySilent(
  hour: number,
  customerInitiated: boolean,
  workingHours?: { from: number; to: number } | null
): { silent: boolean; reason?: string } {
  // Cold outbound at night = always silent. We never wake a customer.
  if (!customerInitiated && (hour <= 6 || hour >= 23)) {
    return { silent: true, reason: "cold_at_night" };
  }
  // If working hours configured, respect them for cold outbound.
  if (!customerInitiated && workingHours) {
    if (hour < workingHours.from || hour >= workingHours.to) {
      return { silent: true, reason: "outside_working_hours" };
    }
  }
  return { silent: false };
}

// ---------------------------------------------------------------------------
// Punctuation jitter — make replies look less polished.
// Examples:
//   "أهلاً بك" → "أهلا بك" (drop diacritics 30% of time)
//   "الحمد لله." → "الحمد لله" (drop trailing period 25%)
// ---------------------------------------------------------------------------

const ARABIC_DIACRITICS = /[\u064B-\u0652]/g;

// Conservative jitter: never touches numbers, product names, prices, or links.
// Diacritic dropping is safe for Arabic readability (modern WhatsApp messages
// rarely have them anyway). Period-drop is rare and only on plain greetings.
// Production tuning: probabilities lowered so customer-facing tone stays clean.
export function applyPunctuationJitter(text: string, casualness = 0.2): string {
  let out = text;
  // Skip jitter entirely on transactional content (prices, links, IDs, OTPs).
  if (/\d{3,}|http|www\.|@|\.com|\.eg|\bجنيه\b|\bج\.م\b|EGP/i.test(out)) {
    return out.replace(/  +/g, " ");
  }
  // Drop diacritics rarely; native MSA users barely use them in chat.
  if (Math.random() < casualness * 0.2) {
    out = out.replace(ARABIC_DIACRITICS, "");
  }
  // Trailing period drop only on very short text (likely a greeting/ack).
  if (out.length < 30 && Math.random() < casualness * 0.18) {
    out = out.replace(/\.$/, "");
  }
  // Always normalize double-spaces.
  out = out.replace(/  +/g, " ");
  return out;
}

// ---------------------------------------------------------------------------
// Micro-typo simulation — RARE, only on long-ish replies, never on numbers
// or product names. Bot may "self-correct" with * فلتعديل like real humans.
// We deliberately keep this off by default; enabled in HumanizeV2 calls only
// when casualness >= 0.5.
// ---------------------------------------------------------------------------

const ADJACENT_AR: Record<string, string> = {
  "ا": "أ", "أ": "ا", "إ": "ا", "ي": "ى", "ى": "ي",
  "ه": "ة", "ة": "ه", "و": "ؤ",
};

// DISABLED for production. Typos in business replies look unprofessional.
// Kept for opt-in only via casualness >= 0.85 (never set automatically).
export function applyTypo(text: string, casualness: number): string {
  if (casualness < 0.85) return text;
  if (text.length < 40) return text;
  if (Math.random() > 0.03) return text;
  // Skip if text contains numbers, prices, links, or product-like tokens.
  if (/\d|http|www\.|@|\.com|\.eg/i.test(text)) return text;
  const idxs: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (ADJACENT_AR[c]) idxs.push(i);
  }
  if (idxs.length === 0) return text;
  const pick = idxs[Math.floor(Math.random() * idxs.length)];
  const swap = ADJACENT_AR[text[pick]];
  return text.slice(0, pick) + swap + text.slice(pick + 1);
}

// ---------------------------------------------------------------------------
// Variable typing speed — emulate operators with different rhythms.
// Average human: 25 cps. Slow: 15. Fast: 40. We don't want every bot session
// to type at exactly the same speed — pick a band per state and stick close.
// ---------------------------------------------------------------------------

export function pickTypingCps(baseCps: number, casualness: number): number {
  // ±25% of base, biased toward slower at high casualness
  const bandLow = Math.max(10, baseCps * 0.75);
  const bandHigh = baseCps * 1.25;
  const r = Math.random();
  return Math.round(bandLow + r * (bandHigh - bandLow));
}

// ---------------------------------------------------------------------------
// Response length variability — sometimes the bot "feels" laconic, other
// times verbose. We don't rewrite the LLM output, just pad/trim ASCII whitespace
// to nudge the typing delay calc.
// ---------------------------------------------------------------------------

export function pickTargetLen(replyLen: number, inboundLen?: number): number {
  // Prefer length proportional to the customer's input.
  if (typeof inboundLen === "number" && inboundLen > 0) {
    const ratio = 0.6 + Math.random() * 1.0;
    return Math.round(Math.min(replyLen, Math.max(40, inboundLen * ratio)));
  }
  return replyLen;
}

// ---------------------------------------------------------------------------
// Public wrapper — non-destructive, returns adjusted text + delays.
// The caller stays in control: it can accept or ignore silentSkip.
// ---------------------------------------------------------------------------

export function applyHumanizeV2(
  text: string,
  basePreDelayMs: number,
  baseTypingDelayMs: number,
  opts: HumanizeV2Options & { customerInitiated: boolean }
): HumanizeV2Result {
  const hour = typeof opts.localHour === "number" ? opts.localHour : new Date().getHours();
  const part = classifyHour(hour);

  const silent = shouldStaySilent(hour, opts.customerInitiated, opts.workingHours);
  if (silent.silent) {
    return {
      text,
      preDelayMs: 0,
      typingDelayMs: 0,
      silentSkip: true,
      reason: silent.reason,
    };
  }

  const factor = timeOfDayDelayFactor(part) * (opts.vipShortcut ? 0.6 : 1);
  // Default casualness lowered — production tone over playful jitter.
  const casualness = typeof opts.casualness === "number" ? opts.casualness : 0.15;

  let out = text;
  out = applyPunctuationJitter(out, casualness);
  // Typo intentionally NOT applied at default casualness (0.2 < 0.85).
  out = applyTypo(out, casualness);

  // Rare "distracted" pause — only 2% of replies, capped at +2.5s.
  let preDelay = basePreDelayMs * factor;
  if (Math.random() < 0.02) {
    preDelay += 1000 + Math.random() * 1500;
  }

  // Typing delay scaled by CPS but capped tighter so customers aren't kept waiting.
  const cps = pickTypingCps(28, casualness);
  const typingDelay = Math.max(600, Math.min(12000, (out.length / cps) * 1000 * factor));

  return {
    text: out,
    preDelayMs: Math.round(preDelay),
    typingDelayMs: Math.round(typingDelay),
  };
}
