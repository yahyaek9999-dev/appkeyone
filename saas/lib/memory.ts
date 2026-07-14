// Phase 1 — Memory Engine.
//
// Goal: give the bot persistent, token-cheap memory of each customer
// without changing the model, scraper, or existing architecture.
//
// Strategy:
//   - Rolling Arabic summary stored per Customer (CustomerMemory.summary).
//   - Structured facts JSON (favorite products, sizes, colors, budget,
//     objections, tone, frequency, last topics) stored alongside.
//   - The summary + a compact "memory block" derived from facts get injected
//     into the system prompt by buildMessages().
//   - Updates run in the BACKGROUND every N inbound user messages
//     (default 20) and call the same LLM that already replies — only one
//     extra call every 20 messages, so amortized cost is ~5%.
//   - When a summary exists, buildMessages truncates history more aggressively
//     (8 instead of 20 messages) → big token reduction on long chats.
//
// No external deps. No vector DB. No Redis. SQLite only.

import { prisma } from "@/lib/db";
import { chat as llmChat } from "@/lib/llm";
import type { ProviderOverride } from "@/lib/llm";
import { botProviderOverride } from "@/lib/providers/bot-provider";

// How many *new* user messages must pile up before we run an extraction.
// Cheap heuristic: 20 ≈ once every ~10 minutes of active chat.
const EXTRACT_EVERY = Math.max(
  5,
  Number(process.env.MEMORY_EXTRACT_EVERY || 8),
);

// Hard guard so we never block the request path on the LLM extractor.
const EXTRACT_TIMEOUT_MS = Math.max(
  10000,
  Number(process.env.MEMORY_EXTRACT_TIMEOUT_MS || 25000),
);

// Concurrency guard — if the same customerId is already being processed,
// drop the duplicate trigger silently. Cheap in-process Set; resets on
// process restart, which is fine.
const inflight = new Set<string>();

export type MemoryFacts = {
  products?: string[];
  sizes?: string[];
  colors?: string[];
  budget?: number;
  frequency?: string; // "first-time" | "occasional" | "frequent"
  tone?: string; // "calm" | "warm" | "impatient" | "skeptical" | ...
  objections?: string[]; // ["price", "shipping", ...]
  negotiation?: string; // "none" | "soft" | "hard" — NOTE: at runtime may also be a NegotiationState object (see negotiation engine)
  lastTopics?: string[];
};

export type CustomerMemorySnapshot = {
  summary: string;
  facts: MemoryFacts;
  hasSummary: boolean;
  memoryConfidence: number;
};

const EMPTY: CustomerMemorySnapshot = {
  summary: "",
  facts: {},
  hasSummary: false,
  memoryConfidence: 50,
};

/** Read the customer's memory row (or empty snapshot). Never throws. */
export async function loadMemory(
  customerId: string,
): Promise<CustomerMemorySnapshot> {
  try {
    const row = await (prisma as any).customerMemory.findUnique({
      where: { customerId },
    });
    if (!row) return EMPTY;
    let facts: MemoryFacts = {};
    try {
      facts = JSON.parse(row.factsJson || "{}");
    } catch {}
    const summary = (row.summary || "").trim();
    return {
      summary,
      facts,
      hasSummary: summary.length > 0,
      memoryConfidence: clampNumber(row.memoryConfidence ?? 50, 0, 100),
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Notify the memory engine that a new inbound user message has been stored.
 * Cheap: just bumps a counter. Triggers a background extraction when the
 * pending count crosses EXTRACT_EVERY. Never throws.
 */
export async function triggerMemoryUpdate(args: {
  customerId: string;
  conversationId: string;
  lastMessageId?: string;
  sentiment?: string | null;
  confidenceScore?: number | null;
  frustrationScore?: number | null;
}): Promise<void> {
  const { customerId, conversationId } = args;
  try {
    const existing = await (prisma as any).customerMemory.findUnique({
      where: { customerId },
    });
    const qualityPatch = buildQualityPatch(existing, args);
    // A real atomic upsert (Prisma compiles this to INSERT ... ON CONFLICT DO
    // UPDATE on Postgres) — not a findUnique-then-create/update branch, which
    // was a genuine race: two inbound messages for the same customer arriving
    // close together (webhook retry/double-text) could both see `!existing`
    // and both call create(), with the loser's uncaught P2002 silently
    // dropping that message's counter increment (this whole function is
    // wrapped in a catch-all so nothing surfaces it).
    await (prisma as any).customerMemory.upsert({
      where: { customerId },
      create: {
        customerId,
        summary: "",
        factsJson: "{}",
        messageCount: 1,
        pendingCount: 1,
        pendingSinceMessageId: args.lastMessageId || null,
        ...qualityPatch,
      },
      update: {
        messageCount: { increment: 1 },
        pendingCount: { increment: 1 },
        ...(existing?.pendingSinceMessageId
          ? {}
          : { pendingSinceMessageId: args.lastMessageId || null }),
        ...qualityPatch,
      },
    });

    const row = await (prisma as any).customerMemory.findUnique({
      where: { customerId },
    });
    if (!row) return;
    if (row.pendingCount < EXTRACT_EVERY) return;

    // Crossed the threshold → run extractor in background.
    if (inflight.has(customerId)) return;
    inflight.add(customerId);
    runExtractor({ customerId, conversationId })
      .catch(() => {})
      .finally(() => inflight.delete(customerId));
  } catch {
    // never break the calling request
  }
}

export type SummarizeNowResult =
  | { ok: true; summary: string }
  | { ok: false; reason: "in_progress" | "no_conversation" | "extract_failed" };

/**
 * On-demand variant of the background rolling summarizer: bypasses the
 * pendingCount threshold and runs the extractor immediately for a merchant-
 * triggered "Summarize Now" action (e.g. Customer 360). Shares the same
 * inflight guard as the background trigger so the two can never race.
 */
export async function summarizeNow(customerId: string): Promise<SummarizeNowResult> {
  if (inflight.has(customerId)) return { ok: false, reason: "in_progress" };

  const customer = await prisma.customer
    .findUnique({ where: { id: customerId }, select: { conversation: { select: { id: true } } } })
    .catch(() => null);
  const conversationId = customer?.conversation?.id;
  if (!conversationId) return { ok: false, reason: "no_conversation" };

  inflight.add(customerId);
  try {
    await runExtractor({ customerId, conversationId });
  } catch {
    return { ok: false, reason: "extract_failed" };
  } finally {
    inflight.delete(customerId);
  }

  const row = await (prisma as any).customerMemory.findUnique({ where: { customerId } }).catch(() => null);
  return { ok: true, summary: (row?.summary || "").trim() };
}

// ---------------------------------------------------------------------------
// Internal: actually call the LLM, parse JSON facts, rewrite summary, merge
// into Customer.preferences for backward compatibility.
// ---------------------------------------------------------------------------
async function runExtractor(args: {
  customerId: string;
  conversationId: string;
}): Promise<void> {
  const { customerId, conversationId } = args;

  // Pull the recent slice that wasn't yet summarized. Cap to keep tokens low.
  const msgs = await prisma.message.findMany({
    where: { conversationId, role: { in: ["user", "assistant"] } },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  if (msgs.length === 0) return;
  msgs.reverse();

  const existing = await (prisma as any).customerMemory.findUnique({
    where: { customerId },
  });
  const prevSummary: string = existing?.summary || "";
  const prevFacts: MemoryFacts = safeFacts(existing?.factsJson);

  // Build a tight, deterministic extractor prompt. The LLM must return JSON.
  const transcript = msgs
    .slice(-30)
    .map(
      (m) =>
        `${m.role === "user" ? "العميل" : "البوت"}: ${m.content.slice(0, 400)}`,
    )
    .join("\n");

  const sys =
    `أنت محرك تلخيص لمحادثة بيع عبر واتساب بين بوت وعميل.\n` +
    `هدفك: تحديث ذاكرة العميل لاستخدامها في ردود مستقبلية.\n` +
    `أعد JSON صالحاً فقط، بدون أي شرح خارج JSON، وبهذا الشكل بالضبط:\n` +
    `{\n` +
    `  "summary": "ملخص عربي قصير جداً (سطرين كحد أقصى) لما يهم في المحادثة: ما يبحث عنه العميل، قراراته، اعتراضاته، أي معلومات شخصية ذكرها صراحةً.",\n` +
    `  "facts": {\n` +
    `    "products": ["..."],\n` +
    `    "sizes": ["..."],\n` +
    `    "colors": ["..."],\n` +
    `    "budget": 0,\n` +
    `    "frequency": "first-time|occasional|frequent",\n` +
    `    "tone": "calm|warm|impatient|skeptical|enthusiastic",\n` +
    `    "objections": ["price","shipping","quality","trust"],\n` +
    `    "negotiation": "none|soft|hard",\n` +
    `    "lastTopics": ["..."]\n` +
    `  }\n` +
    `}\n` +
    `قواعد:\n` +
    `- أزل أي حقل غير مؤكد (لا تخمن).\n` +
    `- budget يكون رقماً فقط لو ذكره العميل صراحةً.\n` +
    `- summary ≤ 240 حرفاً.\n` +
    `- لا تستخدم Markdown ولا تعليقات.`;

  const user =
    (prevSummary
      ? `الملخص السابق:\n${prevSummary}\n\nالحقائق السابقة:\n${JSON.stringify(prevFacts)}\n\n`
      : "") +
    `المحادثة الأخيرة:\n${transcript}\n\nأنتج JSON محدّثاً يدمج الجديد مع السابق.`;

  // Resolve the merchant's chosen AI provider once per extraction cycle (runs
  // every ~20 messages, so the extra query is negligible). Falls back to the
  // default KEYONE path when the merchant has not configured a third-party
  // provider.
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { userId: true },
  });
  const bot = customer
    ? await prisma.bot.findUnique({ where: { userId: customer.userId } })
    : null;
  const provider = botProviderOverride(bot);

  let raw = "";
  try {
    raw = await llmChat(
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      {
        temperature: 0.1,
        maxTokens: 500,
        timeoutMs: EXTRACT_TIMEOUT_MS,
        retries: 0,
        provider,
      },
    );
  } catch {
    // LLM unreachable — just reset pending counter so we retry next cycle.
    await (prisma as any).customerMemory
      .update({
        where: { customerId },
        data: { pendingCount: 0, pendingSinceMessageId: null },
      })
      .catch(() => {});
    return;
  }

  const parsed = parseExtractorJson(raw);
  if (!parsed) {
    await (prisma as any).customerMemory
      .update({
        where: { customerId },
        data: { pendingCount: 0, pendingSinceMessageId: null },
      })
      .catch(() => {});
    return;
  }

  const mergedFacts = mergeFacts(prevFacts, parsed.facts);
  const summary = (parsed.summary || prevSummary).slice(0, 280);

  const lastMsgId = msgs[msgs.length - 1]?.id || null;

  await (prisma as any).customerMemory
    .update({
      where: { customerId },
      data: {
        summary,
        factsJson: JSON.stringify(mergedFacts),
        lastSummarizedMessageId: lastMsgId,
        pendingCount: 0,
        pendingSinceMessageId: null,
      },
    })
    .catch(() => {});

  // Mirror into the legacy Customer.preferences blob so the rest of the
  // codebase (insights, dashboards, buildMessages legacy path) keeps working.
  await prisma.customer
    .update({
      where: { id: customerId },
      data: {
        preferences: JSON.stringify({
          products: mergedFacts.products || [],
          sizes: mergedFacts.sizes || [],
          colors: mergedFacts.colors || [],
          budget:
            typeof mergedFacts.budget === "number"
              ? mergedFacts.budget
              : undefined,
          lastTopics: mergedFacts.lastTopics || [],
        }),
      },
    })
    .catch(() => {});

  // ---- Memory Graph (Agent 1 — Task 3) ----
  // Sibling extractor: derive append-only objection↔outcome / customer↔product
  // edges from the facts we JUST wrote. Runs in the SAME background cycle, does
  // not touch the rolling-summary write above, and is fully fail-closed — a
  // failure here can never affect memory or the reply path. Dynamic import keeps
  // the memory engine's dependency graph unchanged when the flag is off.
  const merchantUserId = customer?.userId;
  if (merchantUserId) {
    import("@/lib/intelligence/memory-graph")
      .then((m) =>
        m.extractMemoryEdges({
          userId: merchantUserId,
          customerId,
          facts: mergedFacts,
        }),
      )
      .catch(() => {});

    // ---- Conversation Semantic Memory ----
    // Sibling snapshot: embed the summary we JUST wrote into the searchable
    // chunk store, so it stays semantically recallable once superseded by a
    // newer summary. Same fail-closed, same-cycle, dynamic-import pattern.
    import("@/lib/intelligence/conversation-memory")
      .then((m) => m.recordConversationMemoryChunk({ userId: merchantUserId, customerId, content: summary }))
      .catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampNumber(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(n) ? n : 50)));
}

function buildQualityPatch(
  row: any,
  args: {
    sentiment?: string | null;
    confidenceScore?: number | null;
    frustrationScore?: number | null;
  },
): Record<string, any> {
  const patch: Record<string, any> = {};
  if (args.sentiment) {
    let history: Array<{ s: string; ts: number }> = [];
    try {
      const parsed = JSON.parse(row?.sentimentHistory || "[]");
      if (Array.isArray(parsed)) history = parsed;
    } catch {}
    history.push({ s: String(args.sentiment).slice(0, 16), ts: Date.now() });
    patch.sentimentHistory = JSON.stringify(history.slice(-10));
  }

  if (
    typeof args.confidenceScore === "number" ||
    typeof args.frustrationScore === "number"
  ) {
    let confidence = clampNumber(row?.memoryConfidence ?? 50);
    if (
      (args.confidenceScore ?? 100) < 40 ||
      (args.frustrationScore ?? 0) >= 70
    )
      confidence -= 5;
    else if (
      (args.confidenceScore ?? 0) >= 75 &&
      (args.frustrationScore ?? 0) < 45
    )
      confidence += 2;
    patch.memoryConfidence = clampNumber(confidence, 20, 95);
  }
  return patch;
}

function safeFacts(s: string | null | undefined): MemoryFacts {
  if (!s) return {};
  try {
    return JSON.parse(s) || {};
  } catch {
    return {};
  }
}

function parseExtractorJson(
  raw: string,
): { summary: string; facts: MemoryFacts } | null {
  if (!raw) return null;
  // Strip code fences if any
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
    const facts = obj.facts && typeof obj.facts === "object" ? obj.facts : {};
    return { summary, facts: sanitizeFacts(facts) };
  } catch {
    return null;
  }
}

function sanitizeFacts(raw: any): MemoryFacts {
  const out: MemoryFacts = {};
  const arr = (v: any, max = 8): string[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    const cleaned = v
      .filter((x) => typeof x === "string")
      .map((x: string) => x.trim())
      .filter(Boolean)
      .slice(0, max);
    return cleaned.length ? cleaned : undefined;
  };
  out.products = arr(raw.products);
  out.sizes = arr(raw.sizes, 6);
  out.colors = arr(raw.colors, 6);
  out.objections = arr(raw.objections, 6);
  out.lastTopics = arr(raw.lastTopics, 5);
  if (
    typeof raw.budget === "number" &&
    isFinite(raw.budget) &&
    raw.budget > 0
  ) {
    out.budget = Math.round(raw.budget);
  }
  if (typeof raw.frequency === "string")
    out.frequency = raw.frequency.slice(0, 20);
  if (typeof raw.tone === "string") out.tone = raw.tone.slice(0, 20);
  if (typeof raw.negotiation === "string")
    out.negotiation = raw.negotiation.slice(0, 20);
  return out;
}

function mergeFacts(prev: MemoryFacts, next: MemoryFacts): MemoryFacts {
  const uniq = (a?: string[], b?: string[], max = 8) => {
    const set = new Set<string>();
    for (const x of [...(a || []), ...(b || [])]) {
      const k = x.trim();
      if (k) set.add(k);
      if (set.size >= max) break;
    }
    return set.size ? Array.from(set) : undefined;
  };
  return {
    products: uniq(prev.products, next.products),
    sizes: uniq(prev.sizes, next.sizes, 6),
    colors: uniq(prev.colors, next.colors, 6),
    objections: uniq(prev.objections, next.objections, 6),
    lastTopics:
      next.lastTopics && next.lastTopics.length
        ? next.lastTopics.slice(0, 5)
        : prev.lastTopics,
    budget: typeof next.budget === "number" ? next.budget : prev.budget,
    frequency: next.frequency || prev.frequency,
    tone: next.tone || prev.tone,
    negotiation: next.negotiation || prev.negotiation,
  };
}

/**
 * Build a compact, token-efficient Arabic memory block to be injected
 * into the system prompt. Returns empty string if nothing useful is known.
 */
export function buildMemoryBlock(snap: CustomerMemorySnapshot): string {
  const lines: string[] = [];
  if (snap.summary) lines.push(`ملخص سابق: ${snap.summary}`);
  if ((snap.memoryConfidence ?? 50) < 45) {
    lines.push(
      "تنبيه ذاكرة: الثقة في الذاكرة منخفضة؛ لا تعتمد على أي تفصيلة غير مؤكدة واسأل سؤال توضيح واحد عند الحاجة.",
    );
  }

  const f = snap.facts || {};
  const bits: string[] = [];
  if (f.products?.length)
    bits.push(`منتجات يهتم بها: ${f.products.slice(0, 5).join("، ")}`);
  if (f.sizes?.length) bits.push(`مقاسات: ${f.sizes.join("، ")}`);
  if (f.colors?.length) bits.push(`ألوان: ${f.colors.join("، ")}`);
  if (typeof f.budget === "number") bits.push(`ميزانية تقريبية: ${f.budget}`);
  if (f.frequency) bits.push(`تكرار التعامل: ${f.frequency}`);
  if (f.tone) bits.push(`أسلوبه: ${f.tone}`);
  if (f.objections?.length)
    bits.push(`اعتراضات سابقة: ${f.objections.join("، ")}`);
  if (f.negotiation && f.negotiation !== "none")
    bits.push(`سلوكه التفاوضي: ${f.negotiation}`);
  if (f.lastTopics?.length)
    bits.push(`آخر مواضيع: ${f.lastTopics.slice(0, 3).join("، ")}`);

  if (bits.length) {
    lines.push(`حقائق: ${bits.join(" | ")}`);
  }

  if (!lines.length) return "";
  return (
    `--- ذاكرة العميل (لا تذكرها صراحةً إلا لو سأل، استخدمها لتخصيص الرد) ---\n` +
    lines.join("\n") +
    `\n--- نهاية الذاكرة ---`
  );
}

/**
 * Lightweight micro-extraction: updates only lastTopics and tone from the
 * current message. Runs fire-and-forget (caller must not await). Cost: ~55
 * tokens per call. Never throws — all errors are swallowed silently.
 */
export async function microUpdateTopics(args: {
  customerId: string;
  messageText: string;
  provider: ProviderOverride | null;
}): Promise<void> {
  const { customerId, messageText, provider } = args;
  if (!messageText || messageText.trim().length < 5) return;
  try {
    const raw = await llmChat(
      [
        {
          role: "system",
          content:
            `أنت مصنّف سريع. أعد JSON فقط:\n` +
            `{"topics":["موضوع1","موضوع2"],"tone":"calm|warm|impatient|skeptical"}\n` +
            `topics: أبرز موضوعين ذكرهما العميل (سلعة، خدمة، أو طلب محدد). tone: نبرة العميل.`,
        },
        { role: "user", content: messageText.slice(0, 250) },
      ],
      { provider, maxTokens: 40, temperature: 0, timeoutMs: 3000 },
    );

    let parsed: { topics?: string[]; tone?: string } = {};
    try {
      parsed = JSON.parse(raw.replace(/```[a-z]*\n?/gi, "").trim());
    } catch {
      return;
    }

    const topics = Array.isArray(parsed.topics)
      ? parsed.topics.filter((t): t is string => typeof t === "string").slice(0, 3)
      : [];
    const tone = typeof parsed.tone === "string" ? parsed.tone : null;
    if (!topics.length && !tone) return;

    const existing = await (prisma as any).customerMemory.findUnique({
      where: { customerId },
    });
    const prevFacts: MemoryFacts = safeFacts(existing?.factsJson);
    const updatedFacts: MemoryFacts = {
      ...prevFacts,
      ...(topics.length ? { lastTopics: topics } : {}),
      ...(tone ? { tone } : {}),
    };

    if (existing) {
      await (prisma as any).customerMemory.update({
        where: { customerId },
        data: { factsJson: JSON.stringify(updatedFacts) },
      });
    } else {
      await (prisma as any).customerMemory.create({
        data: {
          customerId,
          summary: "",
          factsJson: JSON.stringify(updatedFacts),
          messageCount: 0,
          pendingCount: 0,
        },
      });
    }
  } catch {
    // fire-and-forget: never surface errors to caller
  }
}
