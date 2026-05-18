// Human Realism Engine.
//
// Subtle, post-LLM text transforms that break the "AI assistant" feel without
// touching content quality. Runs AFTER humanize.ts (which already varies
// openings + appends one emoji). Realism adds:
//
//   - Anti-repetition memory per customer (last N openings / fillers / emojis)
//   - Occasional natural filler words ("بص", "تمام", "ممم")
//   - Occasional dropped trailing punctuation
//   - Occasional comma instead of period for a softer cadence
//   - Casing imperfection on English-only replies
//   - Energy/rhythm hints based on customer tone & sales mode
//
// HARD RULES:
//   - All transforms are probabilistic with LOW frequencies. Subtlety > chaos.
//   - First-message replies are left clean.
//   - Greetings, complaints, anger responses are NEVER touched (we don't want
//     "بص" prepended to "نأسف بشدة لما حدث").
//   - Never injects new factual content; never alters numbers / prices.
//   - No LLM call, no external APIs, no embeddings.

import { normalizeAr } from "./semantic-match";

// ---------------------------------------------------------------------------
// Bounded anti-repetition memory (per customer)
// ---------------------------------------------------------------------------

interface RealismMemory {
  openings:  string[];  // normalized first-3-words of last N replies
  fillers:   string[];  // last few fillers used
  emojis:    string[];  // last few trailing emojis used
  updatedAt: number;
}

const MAX_TRACKED = 2000;                       // hard cap on Map size
const STALE_MS    = 24 * 60 * 60 * 1000;        // forget customer after 24h
const RING_OPEN   = 6;
const RING_FILLER = 4;
const RING_EMOJI  = 5;

const memo = new Map<string, RealismMemory>();

function getMemo(customerId: string): RealismMemory {
  let m = memo.get(customerId);
  const now = Date.now();
  if (!m || now - m.updatedAt > STALE_MS) {
    m = { openings: [], fillers: [], emojis: [], updatedAt: now };
    memo.set(customerId, m);
    pruneIfOversize();
  }
  m.updatedAt = now;
  return m;
}

function pruneIfOversize() {
  if (memo.size <= MAX_TRACKED) return;
  let oldestId: string | null = null;
  let oldestTs = Infinity;
  memo.forEach((v, id) => {
    if (v.updatedAt < oldestTs) { oldestTs = v.updatedAt; oldestId = id; }
  });
  if (oldestId) memo.delete(oldestId);
}

function ringPush(arr: string[], v: string, cap: number) {
  if (!v) return;
  arr.push(v);
  if (arr.length > cap) arr.shift();
}

// ---------------------------------------------------------------------------
// Lexicons (tight on purpose — broad lists hurt realism)
// ---------------------------------------------------------------------------

const FILLERS = ["تمام،", "ماشي،", "بص،", "حاضر،", "طب،", "حلو،", "أكيد،", "ممم..،"];

const SOFTENERS = ["تقريباً", "غالباً", "ممكن", "يمكن"];

// Phrases we should NEVER prepend a filler to (sensitive contexts).
const SKIP_FILLER_RE = /^(?:نأسف|نعتذر|عذراً|للأسف|sorry|we apologize|🙏|آسف|اعتذر)/i;

// ---------------------------------------------------------------------------
// Tunables — all LOW frequencies. Realism = subtlety.
// ---------------------------------------------------------------------------

const P_FILLER_PREFIX     = 0.06;  // chance to prepend a filler
const P_DROP_END_DOT      = 0.12;  // chance to drop the very last period
const P_COMMA_INSTEAD     = 0.05;  // chance to swap ONE internal period for comma
const P_LOWERCASE_LATIN   = 0.04;  // chance to lowercase first Latin char
const P_FORCE_OPENING_VAR = 0.65;  // when repeated opening detected, chance to actually rewrite

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function openingKey(reply: string): string {
  const head = normalizeAr(reply.trim()).split(/\s+/).slice(0, 3).join(" ");
  return head.slice(0, 40);
}

function pickFresh(pool: string[], recent: string[]): string {
  // Try a few times to grab one not in recent; fall back to any.
  for (let i = 0; i < 4; i++) {
    const c = pool[Math.floor(Math.random() * pool.length)];
    if (!recent.includes(c)) return c;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickEmojiFromReply(reply: string): string {
  const m = reply.match(/\p{Extended_Pictographic}/gu);
  return m && m.length ? m[m.length - 1] : "";
}

// ---------------------------------------------------------------------------
// Energy / rhythm hint — light suggestion for downstream (anti-ban)
// ---------------------------------------------------------------------------

export type Energy = "low" | "neutral" | "high";

export function pickEnergy(opts: {
  hour: number;
  sentiment?: string | null;
  salesMode?: string;
  customerTone?: string;
}): Energy {
  // Late night → low energy
  if (opts.hour >= 1 && opts.hour <= 5) return "low";
  if (opts.sentiment === "angry" || opts.sentiment === "negative") return "low";
  if (opts.salesMode === "fast_close" || opts.salesMode === "scarcity") return "high";
  if (opts.customerTone === "enthusiastic" || opts.customerTone === "impatient") return "high";
  return "neutral";
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export interface RealismContext {
  customerId: string;
  intent?: string | null;
  sentiment?: string | null;
  salesMode?: string;
  customerTone?: string;
  isFirstMsg?: boolean;
  humanizeEnabled?: boolean;
}

export interface RealismResult {
  text: string;
  energy: Energy;
}

/**
 * Apply subtle realism transforms to a finished reply. Pure + low frequency.
 * Quality- and number-safe (transforms never touch digits or KB content).
 */
export function applyRealism(reply: string, ctx: RealismContext): RealismResult {
  const hour = new Date().getHours();
  const energy = pickEnergy({
    hour,
    sentiment: ctx.sentiment,
    salesMode: ctx.salesMode,
    customerTone: ctx.customerTone,
  });

  // Bail-outs — keep these contexts pristine.
  if (!reply || !reply.trim()) return { text: reply, energy };
  if (ctx.isFirstMsg)                                       return { text: reply, energy };
  if (ctx.sentiment === "angry" || ctx.sentiment === "negative") return { text: reply, energy };
  if (ctx.intent === "complaint" || ctx.intent === "greeting")   return { text: reply, energy };
  if (SKIP_FILLER_RE.test(reply.trim()))                    return { text: reply, energy };
  // Humanize is the gate. If the merchant turned humanize off, leave reply alone.
  if (ctx.humanizeEnabled === false)                        return { text: reply, energy };

  const mem = getMemo(ctx.customerId);
  let text = reply;

  // 1) Anti-repetition: if opening is identical to a recent one, prepend a
  // filler (probabilistically) to break the pattern.
  const opKey = openingKey(text);
  const repeatedOpening = mem.openings.includes(opKey);
  const wantFiller =
    (repeatedOpening && Math.random() < P_FORCE_OPENING_VAR) ||
    Math.random() < P_FILLER_PREFIX;

  if (wantFiller && !startsWithFiller(text)) {
    const f = pickFresh(FILLERS, mem.fillers);
    text = `${f} ${text.replace(/^\s+/, "")}`;
    ringPush(mem.fillers, f, RING_FILLER);
  }

  // 2) Casing imperfection — only on replies that start with a Latin letter.
  if (Math.random() < P_LOWERCASE_LATIN && /^[A-Z]/.test(text)) {
    text = text[0].toLowerCase() + text.slice(1);
  }

  // 3) Drop very last period sometimes (Arabic chat rarely uses trailing dots).
  if (Math.random() < P_DROP_END_DOT) {
    text = text.replace(/\.\s*$/, "");
  }

  // 4) Swap ONE internal period with a comma for a softer cadence.
  if (Math.random() < P_COMMA_INSTEAD) {
    text = text.replace(/\.(\s)(?=[\u0600-\u06FFA-Za-z])/, "،$1");
  }

  // 5) Energy modulation — low-energy responses lose the emoji.
  if (energy === "low") {
    text = text.replace(/\s*\p{Extended_Pictographic}\s*$/u, "");
  }

  // 6) Update anti-repetition memory with the FINAL opening + emoji.
  ringPush(mem.openings, openingKey(text), RING_OPEN);
  const em = pickEmojiFromReply(text);
  if (em) ringPush(mem.emojis, em, RING_EMOJI);

  return { text, energy };
}

function startsWithFiller(text: string): boolean {
  const head = text.trimStart().slice(0, 12);
  return FILLERS.some((f) => head.startsWith(f.replace(/،$/, "")));
}

// ---------------------------------------------------------------------------
// Public — anti-rep state observer (no side effects). For dashboards/tests.
// ---------------------------------------------------------------------------

export function debugMemo(customerId: string): RealismMemory | null {
  return memo.get(customerId) || null;
}
