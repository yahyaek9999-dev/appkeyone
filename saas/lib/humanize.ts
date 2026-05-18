// ---------------------------------------------------------------------------
// Human simulation layer (Wave 5).
// Pure utility functions, no external calls. Used by the WhatsApp pipeline
// to make AI replies feel less robotic:
//   * variable typing delay based on reply length
//   * one context-appropriate emoji at the end (when enabled)
//   * gentle opening variations to avoid the "hello hello hello" pattern
// ---------------------------------------------------------------------------

export interface HumanizeConfig {
  enabled: boolean;
  typingSpeedCps: number;     // chars per second (avg human ≈ 25-40)
  preReplyDelayMs: number;    // "reading" pause before typing starts
  dynamicEmojis: boolean;
  replyVariations: boolean;
}

/**
 * Compute the typing delay in milliseconds proportional to reply length.
 * Adds light random jitter so two identical replies don't take the exact
 * same time. Capped to keep the customer waiting at most 8s typing.
 */
export function computeTypingDelayMs(
  reply: string,
  cfg: { typingSpeedCps: number }
): number {
  const len = (reply || "").length;
  if (len === 0) return 0;
  const cps = Math.max(8, Math.min(80, cfg.typingSpeedCps || 25));
  const baseMs = (len / cps) * 1000;
  // ±15% jitter so it feels organic
  const jitter = baseMs * (Math.random() * 0.3 - 0.15);
  // Floor at 600ms so very short replies still feel typed (not pasted)
  return Math.max(600, Math.min(8000, Math.round(baseMs + jitter)));
}

/**
 * Pre-reply "reading" delay. The bot pauses briefly before showing
 * the typing indicator, like a human glancing at the message first.
 */
export function computeReadDelayMs(
  cfg: { preReplyDelayMs: number }
): number {
  const base = Math.max(0, Math.min(3000, cfg.preReplyDelayMs || 800));
  const jitter = base * (Math.random() * 0.4 - 0.2);
  return Math.max(0, Math.round(base + jitter));
}

// ---------------------------------------------------------------------------
// Emoji picker — context-aware. Returns ONE emoji or empty string.
// Deliberately conservative so we don't over-use emojis.
// ---------------------------------------------------------------------------

const EMOJI_BANK = {
  greeting:   ["👋", "🌹", "💫", "✨"],
  buy:        ["🛒", "🎉", "💼", "✅"],
  inquiry:    ["💡", "📌", "🤔", "✍️"],
  complaint:  ["🙏", "😔", "💙"],
  support:    ["🛠️", "🔎", "💪"],
  positive:   ["😊", "🌹", "✨", "🤗"],
  negative:   ["🙏", "💙", "😔"],
  angry:      ["🙏", "🤝"],
  neutral:    ["", "", ""],   // mostly nothing
};

export function pickEmoji(opts: {
  intent?: string | null;
  sentiment?: string | null;
  reply: string;
}): string {
  const { intent, sentiment, reply } = opts;
  // If reply already ends with an emoji, leave it
  if (/\p{Extended_Pictographic}\s*$/u.test(reply)) return "";
  // Skip if reply is a question (looks weird with emoji)
  if (/[؟?]\s*$/.test(reply.trim())) return "";

  // Choose pool — sentiment first when strong, otherwise intent
  let pool: string[] | undefined;
  if (sentiment === "angry" || sentiment === "negative") {
    pool = EMOJI_BANK[sentiment];
  } else if (intent && (EMOJI_BANK as any)[intent]) {
    pool = (EMOJI_BANK as any)[intent];
  } else if (sentiment && (EMOJI_BANK as any)[sentiment]) {
    pool = (EMOJI_BANK as any)[sentiment];
  } else {
    pool = EMOJI_BANK.neutral;
  }
  if (!pool || pool.length === 0) return "";
  // 60% chance to actually emit one (avoid emoji on every single reply)
  if (Math.random() > 0.6) return "";
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Append a single emoji to the reply if humanize is on and conditions match. */
export function applyDynamicEmoji(
  reply: string,
  cfg: HumanizeConfig,
  ctx: { intent?: string | null; sentiment?: string | null }
): string {
  if (!cfg.enabled || !cfg.dynamicEmojis) return reply;
  const e = pickEmoji({ intent: ctx.intent, sentiment: ctx.sentiment, reply });
  if (!e) return reply;
  return reply.replace(/\s+$/, "") + " " + e;
}

// ---------------------------------------------------------------------------
// Reply opening variation: rewrite a stale opening with a softer alternative.
// Disabled by default for greetings/first-message — those should be standard.
// ---------------------------------------------------------------------------

const STALE_OPENINGS = [
  "أهلاً بك", "أهلا بك", "مرحباً", "مرحبا",
  "بكل تأكيد", "بالتأكيد",
  "مع خالص الشكر", "شكراً لتواصلك",
];

const SOFT_OPENINGS = [
  "تمام،", "حاضر،", "سعيد بسؤالك،", "ممتاز،",
  "أكيد،", "طبعاً،", "من غير شك،",
];

export function varyOpening(
  reply: string,
  cfg: HumanizeConfig,
  isFirstMsg: boolean
): string {
  if (!cfg.enabled || !cfg.replyVariations) return reply;
  if (isFirstMsg) return reply; // keep first-msg greetings clean

  const trimmed = reply.trimStart();
  for (const stale of STALE_OPENINGS) {
    if (trimmed.startsWith(stale)) {
      // 50% chance to replace
      if (Math.random() < 0.5) {
        const replacement = SOFT_OPENINGS[Math.floor(Math.random() * SOFT_OPENINGS.length)];
        return replacement + " " + trimmed.slice(stale.length).replace(/^[،,!.\s]+/, "");
      }
    }
  }
  return reply;
}

// ---------------------------------------------------------------------------
// LLM temperature for humanized variations.
// Slightly higher when humanize is on so the model writes less templated text.
// ---------------------------------------------------------------------------

export function pickTemperature(cfg: HumanizeConfig): number {
  if (!cfg.enabled) return 0.4;
  if (cfg.replyVariations) return 0.85;
  return 0.6;
}

// ---------------------------------------------------------------------------
// One-call wrapper applied in the webhook
// ---------------------------------------------------------------------------

export function humanizeReply(
  reply: string,
  cfg: HumanizeConfig,
  ctx: { intent?: string | null; sentiment?: string | null; isFirstMsg?: boolean }
): { text: string; preDelayMs: number; typingDelayMs: number } {
  if (!cfg.enabled) {
    return { text: reply, preDelayMs: 0, typingDelayMs: 0 };
  }
  let out = reply;
  out = varyOpening(out, cfg, !!ctx.isFirstMsg);
  out = applyDynamicEmoji(out, cfg, { intent: ctx.intent, sentiment: ctx.sentiment });
  return {
    text: out,
    preDelayMs: computeReadDelayMs(cfg),
    typingDelayMs: computeTypingDelayMs(out, cfg),
  };
}
