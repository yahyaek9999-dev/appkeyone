import {
  compressHistory,
  classifyComplexity,
  depthForComplexity,
} from "./semantic-match";
import { coalesce, fingerprintMessages } from "./fast-path";
import { routeProviderChat } from "./providers/provider-router";
import type { ProviderId } from "./providers/types";
import { bumpProvider, bump } from "./metrics";

// ---------------------------------------------------------------------------
// Token estimation (Arabic-aware, no tokenizer dependency)
// ---------------------------------------------------------------------------
// Arabic Unicode block chars cost ~1.5-2 tokens each; Latin chars ~0.25.
// Conservative heuristic: arabic/2 + latin/4 → errs on the side of MORE tokens
// so we never accidentally over-stuff the context window.
function estimateTokens(s: string): number {
  const arabicChars = (s.match(/[؀-ۿݐ-ݿࢠ-ࣿ]/g) || []).length;
  return Math.ceil(arabicChars / 2 + (s.length - arabicChars) / 4);
}

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "gpt-4o-mini": 127_000,
  "gpt-4o": 127_000,
  "gpt-4.1": 127_000,
  "claude-3-5-haiku-latest": 195_000,
  "claude-3-5-sonnet-20241022": 195_000,
  "claude-opus-4-5": 195_000,
  "gemini-2.0-flash": 999_000,
  "gemini-1.5-pro": 999_000,
  "llama-3.3-70b-versatile": 32_000,
  "llama-3.1-8b-instant": 32_000,
};
const DEFAULT_CONTEXT_TOKENS = 30_000;

function modelContextLimit(modelHint?: string | null): number {
  if (!modelHint) return DEFAULT_CONTEXT_TOKENS;
  return MODEL_CONTEXT_LIMITS[modelHint] ?? DEFAULT_CONTEXT_TOKENS;
}

// LLM client that talks to the existing mse_ai_api (OpenAI-compatible).
//
// IMPORTANT: This module DOES NOT modify any LLM responses. It only:
//   1. Limits concurrent in-flight requests (semaphore) so the underlying
//      CloakBrowser doesn't get hammered.
//   2. Round-robins across multiple LLM instances (LLM_API_URLS).
//   3. Retries transient failures.
//   4. Optionally dispatches to a third-party provider (OpenAI / Gemini /
//      OpenRouter / Claude / Groq) when the merchant has configured one.
//      Behavior layers (realism, anti-ban, memory, sales, semantic-match,
//      fast-path, cache, quick-replies, order-extractor) run upstream and
//      are NOT affected by the provider choice — only the text-generation
//      source changes.
// The actual chat completion request body & response are forwarded unchanged.
type Msg = { role: "system" | "user" | "assistant"; content: string };

/**
 * Per-call provider override. When supplied with a non-`keyone` provider and
 * a non-empty apiKey, the request bypasses the in-house mse_ai_api cluster
 * and is routed to the merchant's chosen vendor instead.
 */
export type ProviderOverride = {
  provider: ProviderId;
  apiKey?: string | null;
  model?: string | null;
};

// ---------------------------------------------------------------------------
// Configuration (all env-driven, safe defaults)
// ---------------------------------------------------------------------------
function getUrls(): string[] {
  // Comma-separated list takes precedence
  const multi = (process.env.LLM_API_URLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (multi.length > 0) return multi;
  // In-house mse_ai_api engine REMOVED — no 127.0.0.1:7788 fallback. Only an
  // explicitly-set LLM_API_URL is honored; otherwise there is NO in-house URL
  // and the platform relies solely on per-tenant third-party providers.
  const single = (process.env.LLM_API_URL || "").trim();
  return single ? [single] : [];
}

// ---------------------------------------------------------------------------
// Concurrency limiter — at most MAX_CONCURRENT_LLM requests are forwarded
// to the LLM cluster at any moment. Excess requests wait in a FIFO queue.
// ---------------------------------------------------------------------------
const MAX_CONCURRENT_LLM = Math.max(
  1,
  Number(process.env.LLM_MAX_CONCURRENT || 3),
);
let active = 0;
const waiters: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT_LLM) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
}
function release(): void {
  active--;
  const next = waiters.shift();
  if (next) next();
}

// ---------------------------------------------------------------------------
// Round-robin index across the configured LLM URLs
// ---------------------------------------------------------------------------
let rrIdx = 0;
function pickUrls(): string[] {
  const urls = getUrls();
  if (urls.length <= 1) return urls;
  // Rotate so requests are spread; each call returns the full list starting
  // from a different position so retries try a different instance.
  rrIdx = (rrIdx + 1) % urls.length;
  return [...urls.slice(rrIdx), ...urls.slice(0, rrIdx)];
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Circuit breaker — when the in-house keyone LLM is dead (e.g. ChatGPT session
// expired) every request would otherwise wait 60s × 3 retries before falling
// back to the Arabic "technical error" string. This breaker fails fast: after
// FAIL_THRESHOLD consecutive 5xx/timeout failures inside FAIL_WINDOW_MS, the
// URL is marked open for OPEN_MS and rejects new attempts immediately. A
// single success closes it again.
// ---------------------------------------------------------------------------
const FAIL_THRESHOLD = 5;
const FAIL_WINDOW_MS = 30_000;
const OPEN_MS = 60_000;
type BreakerState = { fails: number; firstFailAt: number; openUntil: number };
const breakers: Map<string, BreakerState> = new Map();

function getBreaker(url: string): BreakerState {
  let b = breakers.get(url);
  if (!b) {
    b = { fails: 0, firstFailAt: 0, openUntil: 0 };
    breakers.set(url, b);
  }
  return b;
}
function breakerIsOpen(url: string): boolean {
  const b = breakers.get(url);
  if (!b) return false;
  if (b.openUntil > 0 && Date.now() < b.openUntil) return true;
  if (b.openUntil > 0 && Date.now() >= b.openUntil) {
    // half-open: clear and allow one probe
    b.openUntil = 0;
    b.fails = 0;
    b.firstFailAt = 0;
  }
  return false;
}
function breakerRecordSuccess(url: string): void {
  const b = breakers.get(url);
  if (b) {
    b.fails = 0;
    b.firstFailAt = 0;
    b.openUntil = 0;
  }
}
function breakerRecordFailure(url: string): void {
  const b = getBreaker(url);
  const now = Date.now();
  if (b.firstFailAt === 0 || now - b.firstFailAt > FAIL_WINDOW_MS) {
    b.firstFailAt = now;
    b.fails = 1;
    return;
  }
  b.fails += 1;
  if (b.fails >= FAIL_THRESHOLD) {
    b.openUntil = now + OPEN_MS;
    console.warn(
      `[llm] circuit OPEN for ${url} (${b.fails} fails); cooling ${OPEN_MS}ms`,
    );
  }
}

// ---------------------------------------------------------------------------
// Single attempt against one URL with hard timeout
// ---------------------------------------------------------------------------
async function callOnce(
  url: string,
  key: string,
  body: unknown,
  timeoutMs: number,
): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url + "/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = JSON.stringify(await res.json());
      } catch {}
      const err: any = new Error(`LLM error ${res.status} ${detail}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(t);
  }
}

export async function chat(
  messages: Msg[],
  opts: {
    temperature?: number;
    maxTokens?: number;
    retries?: number;
    timeoutMs?: number;
    coalesce?: boolean;
    /** Optional per-call provider override (per-bot AI provider). */
    provider?: ProviderOverride | null;
    /**
     * Optional ordered list of providers for cross-provider failover (universal
     * providers vault). When non-empty, each is tried in turn; if all fail the
     * call falls back to the in-house keyone cluster. Takes precedence over
     * `provider`. Absent/empty → behavior is identical to before (no failover).
     */
    providers?: ProviderOverride[] | null;
    /**
     * If supplied, the provider's call/failure/token/latency is recorded
     * under this userId in `ProviderUsage`. When omitted, metering is
     * skipped (e.g. anonymous internal callers).
     */
    meterUserId?: string;
  } = {},
): Promise<string> {
  const key = process.env.LLM_API_KEY || "change-secret-key-2026";
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  const retries = opts.retries ?? 2; // up to 3 attempts total
  const timeoutMs = opts.timeoutMs ?? 60000; // 60s per attempt
  const meterUserId = opts.meterUserId;

  // ---- Third-party provider dispatch ------------------------------------
  // If the merchant configured a non-`keyone` provider AND supplied a key,
  // route the call to that vendor. We still go through the same coalescing
  // path so behavior under load is identical to the default route.
  const ov = opts.provider;
  const useExternal =
    ov &&
    ov.provider &&
    ov.provider !== "keyone" &&
    !!(ov.apiKey && ov.apiKey.length > 0);

  // Universal providers failover list (vault). Filtered to real external keys.
  const failoverList = (opts.providers || []).filter(
    (p): p is ProviderOverride =>
      !!p && p.provider !== "keyone" && !!(p.apiKey && p.apiKey.length > 0),
  );
  const useFailover = failoverList.length > 0;

  const body: any = { model, messages };
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;
  if (typeof opts.maxTokens === "number") body.max_tokens = opts.maxTokens;

  // Coalesce identical concurrent prompts. Disabled for randomized
  // (high-temperature) replies so two callers don't lose their variations, and
  // for the failover path (per-provider attempts must not be shared).
  const canCoalesce = opts.coalesce !== false && (opts.temperature ?? 0) <= 0.6 && !useFailover;
  const runOnce = () =>
    useFailover
      ? runFailoverChat(
          messages,
          failoverList,
          opts.temperature,
          opts.maxTokens,
          body,
          key,
          timeoutMs,
          retries,
          meterUserId,
          model,
        )
      : useExternal
      ? runExternalChat(
          messages,
          ov!,
          opts.temperature,
          opts.maxTokens,
          timeoutMs,
          retries,
          meterUserId,
        )
      : runChatOnce(body, key, timeoutMs, retries, meterUserId, model);
  if (canCoalesce) {
    // Include provider id in the fingerprint so two merchants with different
    // providers but identical prompts don't accidentally share a response.
    const fpBody = useExternal
      ? { ...body, __p: ov!.provider, __m: ov!.model || "" }
      : body;
    const fp = fingerprintMessages(fpBody);
    return coalesce(fp, runOnce);
  }
  return runOnce();
}

async function runExternalChat(
  messages: Msg[],
  ov: ProviderOverride,
  temperature: number | undefined,
  maxTokens: number | undefined,
  timeoutMs: number,
  retries: number,
  meterUserId: string | undefined,
): Promise<string> {
  // Concurrency-limit external providers too. Even though the in-house
  // CloakBrowser isn't involved, the merchant's vendor account often has
  // strict per-second QPS limits — sharing the same semaphore protects them
  // and keeps RAM/sockets bounded under bursts.
  await acquire();
  const t0 = Date.now();
  try {
    const r = await routeProviderChat(messages, {
      provider: ov.provider as Exclude<ProviderId, "keyone">,
      apiKey: ov.apiKey || "",
      model: ov.model || null,
      temperature,
      maxTokens,
      timeoutMs,
      retries,
    });
    if (meterUserId) {
      bumpProvider({
        userId: meterUserId,
        provider: ov.provider,
        model: ov.model || null,
        success: true,
        inputTokens: r.usage?.inputTokens,
        outputTokens: r.usage?.outputTokens,
        latencyMs: Date.now() - t0,
      });
    }
    return r.text;
  } catch (e) {
    if (meterUserId) {
      bumpProvider({
        userId: meterUserId,
        provider: ov.provider,
        model: ov.model || null,
        success: false,
        latencyMs: Date.now() - t0,
      });
    }
    throw e;
  } finally {
    release();
  }
}

/**
 * Cross-provider failover: try each external provider in order. On the first
 * success, return it. If every external provider fails, fall back to the
 * in-house keyone cluster (so the merchant always gets a reply). Each failover
 * hop bumps the `provider_fallback` metric. Additive — only used when the
 * caller supplies `opts.providers` (universal providers vault).
 */
async function runFailoverChat(
  messages: Msg[],
  list: ProviderOverride[],
  temperature: number | undefined,
  maxTokens: number | undefined,
  body: any,
  key: string,
  timeoutMs: number,
  retries: number,
  meterUserId: string | undefined,
  model: string,
): Promise<string> {
  let lastErr: any = null;
  for (let i = 0; i < list.length; i++) {
    const ov = list[i]!;
    try {
      return await runExternalChat(messages, ov, temperature, maxTokens, timeoutMs, retries, meterUserId);
    } catch (e) {
      lastErr = e;
      if (meterUserId) bump("provider_fallback", meterUserId);
      // advance to the next configured provider
    }
  }
  // Every tenant-configured provider failed → in-house keyone fallback.
  try {
    return await runChatOnce(body, key, timeoutMs, retries, meterUserId, model);
  } catch (e) {
    throw lastErr || e;
  }
}

async function runChatOnce(
  body: any,
  key: string,
  timeoutMs: number,
  retries: number,
  meterUserId?: string,
  modelHint?: string,
): Promise<string> {
  await acquire();
  const t0 = Date.now();
  try {
    // mse_ai_api engine removed: with no LLM_API_URL(S) configured there is no
    // in-house cluster to call. Fail fast with a clear message instead of
    // hanging on a dead localhost:7788.
    if (getUrls().length === 0) {
      throw new Error(
        "لا يوجد مزوّد ذكاء اصطناعي مهيّأ لهذا الحساب — أضف مفتاح مزوّد (OpenRouter/OpenAI/Gemini/Claude).",
      );
    }
    let lastErr: any = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const urlsThisAttempt = pickUrls();
      let triedAtLeastOne = false;
      for (const url of urlsThisAttempt) {
        if (breakerIsOpen(url)) {
          lastErr = lastErr || new Error(`LLM circuit open for ${url}`);
          continue;
        }
        triedAtLeastOne = true;
        try {
          const text = await callOnce(url, key, body, timeoutMs);
          breakerRecordSuccess(url);
          if (meterUserId) {
            bumpProvider({
              userId: meterUserId,
              provider: "keyone",
              model: modelHint || body?.model || null,
              success: true,
              latencyMs: Date.now() - t0,
            });
          }
          return text;
        } catch (e: any) {
          lastErr = e;
          const st: number = e?.status || 0;
          // Count timeouts/5xx/network errors toward the breaker. 4xx other
          // than 408/429 are upstream rejections (bad request, auth) and
          // should NOT trip the breaker.
          if (st === 0 || st === 408 || st === 429 || (st >= 500 && st < 600)) {
            breakerRecordFailure(url);
          }
          // Don't bother retrying client-side 4xx (except 408/429)
          if (st >= 400 && st < 500 && st !== 408 && st !== 429) {
            if (meterUserId) {
              bumpProvider({
                userId: meterUserId,
                provider: "keyone",
                model: modelHint || body?.model || null,
                success: false,
                latencyMs: Date.now() - t0,
              });
            }
            throw e;
          }
          // try next URL silently within this attempt
        }
      }
      // If every URL was breaker-open we shouldn't burn the retry budget
      // waiting and rotating — break out and let the caller see the error
      // immediately. Saves merchants from 3-minute hangs when LLM is dead.
      if (!triedAtLeastOne) break;
      if (attempt < retries) {
        const delay =
          500 * Math.pow(2, attempt) + Math.floor(Math.random() * 400);
        await sleep(delay);
      }
    }
    if (meterUserId) {
      bumpProvider({
        userId: meterUserId,
        provider: "keyone",
        model: modelHint || body?.model || null,
        success: false,
        latencyMs: Date.now() - t0,
      });
    }
    throw lastErr || new Error("LLM exhausted retries");
  } finally {
    release();
  }
}

// Build the prompt with knowledge base context + history
export function buildMessages(opts: {
  systemPrompt: string;
  botName: string;
  persona: string;
  welcomeMessage?: string;
  knowledgeBase?: string;
  history: { role: string; content: string }[];
  newUserMsg: string;
  customerName?: string | null;
  customerPhone?: string;
  // ---- Wave 5+: behavior modifiers ----
  humanize?: boolean; // adds variety + natural rhythm to replies
  customerPreferences?: string; // JSON string of past prefs (Wave 9 personalization)
  customerLeadScore?: number; // 0-100, used for tone adjustment
  customerLastIntent?: string | null;
  // ---- Wave 7 sales modifiers ----
  persuasionEnabled?: boolean;
  negotiationEnabled?: boolean;
  negotiationFloorPct?: number;
  // ---- Phase 1: Memory Engine ----
  // Pre-rendered Arabic memory block (summary + facts). When present, history
  // is truncated more aggressively to save tokens — the summary already
  // captures everything important from older turns.
  memoryBlock?: string;
  // ---- Phase 2: Sales Brain ----
  // Pre-rendered ultra-short persuasion guidance (≤120 tokens). Empty string
  // means "no extra guidance" — preserves the default behavior.
  salesBlock?: string;
  // ---- Issue #6: per-business mode ----
  businessMode?: string; // store | restaurant | real_estate | services | custom
  // ---- Issue #11: policy grounding ----
  policyRules?: string; // verbatim merchant-authored rules, injected as a hard constraint
  // ---- Production intelligence: emotional tone adaptation ----
  emotionalContext?: string; // pre-rendered tone/sentiment block from lib/sentiment
  // ---- Token budget: helps trim context for smaller models ----
  modelHint?: string | null; // resolved model name for context-window sizing
}): Msg[] {
  const sys: string[] = [];
  sys.push(`أنت "${opts.botName}", مساعد ذكي يخدم زبائن شركة عبر واتساب.`);
  sys.push(`شخصيتك: ${opts.persona}`);
  sys.push(opts.systemPrompt);
  sys.push(
    `قواعد صارمة:
- تكلم بالعربية الفصحى البسيطة أو العامية المصرية حسب أسلوب العميل.
- لا تكرر نفس الإجابة. لا تكرر التحية في كل رسالة.
- إجاباتك مختصرة ومباشرة وواضحة (2-4 جمل عادةً).
- لا تختلق معلومات أو أسعاراً. التزم تماماً بمحتوى قاعدة المعرفة.
- لو السؤال خارج معلوماتك, اعتذر بصراحة واطلب التواصل مع رقم الإدارة.
- لا تستخدم رموز Markdown ثقيلة في الواتساب; استخدم * للتأكيد فقط.

عند الاستفسار عن الأسعار أو الباقات:
- اعرض المعلومات من قاعدة المعرفة بدقة، ورتّبها كقائمة قصيرة.
- اسأل العميل عن حجم نشاطه أو احتياجه عشان ترشّحله الأنسب.
- لو العميل أبدى نية شراء أو اشتراك، اطلب اسمه ورقمه واطلب منه التواصل مع رقم واتساب الإدارة لإتمام التفعيل والدفع.
- لو السعر مش متوفر في معلوماتك، قول إن فريق المبيعات هيتواصل معاه بعرض دقيق ولا تخترع رقم.

عند ذكر دفع أو تحويل أو إيصال أو طلب:
- اشكر العميل وأكّد له استلام معلوماته.
- وضّح أن الإدارة هتراجع الطلب وتتواصل معاه لتأكيد التفعيل.

عند عدم وضوح طلب العميل (Issue #10):
- لو السؤال غامض أو يحتمل أكثر من معنى، اسأل عن التوضيح بأدب بدلاً من التخمين.
- لا تخترع تفاصيل أو معلومات لم تذكر في قاعدة المعرفة.
- لو العميل كتب بأخطاء إملائية أو لهجة غير مألوفة، حاول تفهم نيته من السياق، ولو فضلت غامضة اطلب التوضيح.`,
  );

  // ---- Issue #11: policy grounding (HARD CONSTRAINT) -----------------------
  // The merchant authored these rules verbatim. They override anything the LLM
  // might "want" to promise. We mark them as the highest-priority constraint.
  const _policy = (opts.policyRules || "").trim();
  if (_policy) {
    sys.push(
      `--- سياسة الشركة الصارمة (التزم بها 100% — تتقدم على أي قاعدة أخرى) ---\n` +
        _policy.slice(0, 2000) +
        `\n` +
        `لا تعد بأي شيء يخالف هذه السياسة. لو العميل طلب شيء خارجها، اعتذر بأدب ووجّهه للإدارة.\n` +
        `--- نهاية السياسة ---`,
    );
  }

  // ---- Issue #6: per-business mode -----------------------------------------
  // Each mode gets a SHORT block (≤80 tokens) that tunes the bot's defaults
  // for that industry. "store" matches the previous global behavior, so
  // existing merchants see no change unless they explicitly switch modes.
  const _mode = (opts.businessMode || "store").trim();
  if (_mode === "restaurant") {
    sys.push(
      `وضع المطعم: تعامل مع الأسئلة عن المنيو، الأطباق، الأسعار، والتوصيل بسرعة وودود. ` +
        `اسأل عن عدد الأشخاص، نوع الطلب (داخل/خارج)، والوقت المفضل للتسليم. ` +
        `أكّد كل طلب بشكل واضح قبل الإرسال للمطبخ.`,
    );
  } else if (_mode === "real_estate") {
    sys.push(
      `وضع العقارات: ركّز على الموقع، المساحة، السعر، حالة العقار، طريقة الدفع. ` +
        `اسأل عن نوع العقار المطلوب، الميزانية، المنطقة، والغرض (سكن/استثمار). ` +
        `لا تقطع وعداً بمعاينة قبل الرجوع للإدارة.`,
    );
  } else if (_mode === "services") {
    sys.push(
      `وضع الخدمات: ركّز على وصف الخدمة، المدة، السعر، ومتى يبدأ التنفيذ. ` +
        `اسأل عن طبيعة الطلب، الموعد المفضل، والمكان لو الخدمة ميدانية. ` +
        `أكّد كل تفصيلة قبل تأكيد الحجز.`,
    );
  } else if (_mode === "custom") {
    // Fall through to merchant's own systemPrompt — no extra instruction needed.
  } else {
    // store (default) — preserve current behavior, no extra block.
  }

  if (opts.emotionalContext && opts.emotionalContext.trim()) {
    sys.push(opts.emotionalContext.trim());
  }

  if (opts.knowledgeBase && opts.knowledgeBase.trim()) {
    // Budget-aware KB slice: estimate tokens used so far and limit KB to
    // fit comfortably within the model context window. Hard ceiling: 12,000
    // chars for unknown models; budget-aware ceiling for known models.
    const contextLimit = modelContextLimit(opts.modelHint);
    const sysTokensSoFar = estimateTokens(sys.join("\n\n"));
    // Reserve 30% of context for history + response; allocate rest to KB.
    const kbTokenBudget = Math.max(500, Math.floor(contextLimit * 0.4) - sysTokensSoFar);
    // Convert token budget back to a char limit (pessimistic: × 2 for Arabic)
    const kbCharLimit = Math.min(12000, kbTokenBudget * 2);
    sys.push(
      `--- معلومات الشركة (استخدمها كمصدر رئيسي) ---\n${opts.knowledgeBase.slice(
        0,
        kbCharLimit,
      )}\n--- نهاية المعلومات ---`,
    );
  }
  if (opts.customerName || opts.customerPhone) {
    sys.push(
      `العميل الحالي: ${opts.customerName || "بدون اسم"} (${
        opts.customerPhone || ""
      })`,
    );
  }

  // ---- Auto contact-capture for LID / unknown contacts ---------------------
  // We only ask for contact info when ALL of these hold:
  //   1. We don't already have a real phone (LID-style or empty) OR we don't
  //      have a name AT ALL.
  //   2. The bot HAS NOT already asked in this conversation. We scan the
  //      assistant history for the phrase pattern; if found we skip the
  //      injection entirely so the bot stops badgering the customer.
  //   3. The conversation isn't already mid-order (we'd disrupt the flow).
  //
  // Hard rule: once we have BOTH name + non-LID phone, NEVER ask again.
  const _phone = (opts.customerPhone || "").trim();
  const _isLid =
    _phone.startsWith("lid:") || _phone.includes("@lid") || !_phone;
  const _needsName = !opts.customerName || !opts.customerName.trim();
  const _haveBoth = !_isLid && !_needsName;

  // Anti-badger: detect if a prior assistant message already asked for the
  // contact info. The bot has many phrasings ("ابعتلي اسمك", "ممكن اسمك",
  // "رقم تليفونك"), so we match on the keyword pair.
  const _assistantHistory = (opts.history || [])
    .filter((m) => m.role === "assistant")
    .map((m) => m.content || "")
    .join("\n");
  const _askedNameBefore = /\b(اسمك|اسمه|اسم حضرتك|اسم[يه]?|name)\b/i.test(
    _assistantHistory,
  );
  const _askedPhoneBefore =
    /\b(رقمك|تليفونك|رقم تليفونك|واتسابك|واتساب|phone|number)\b/i.test(
      _assistantHistory,
    );

  if (!_haveBoth) {
    const need: string[] = [];
    const stillMissing: string[] = [];
    if (_isLid) {
      need.push("رقم تليفونه (واتساب أخفاه عنا)");
      if (!_askedPhoneBefore) stillMissing.push("phone");
    }
    if (_needsName) {
      need.push("اسمه");
      if (!_askedNameBefore) stillMissing.push("name");
    }
    if (stillMissing.length > 0) {
      // We still need something AND we haven't asked for it yet.
      sys.push(
        `ملاحظة عن العميل: لسه ما عندناش ${need.join(" و")}. ` +
          `لو الفرصة مناسبة في الرد ده، اطلبهم منه بأسلوب ودود ومختصر مرة واحدة فقط. ` +
          `بعد ما يبعتهم، ما تسألوش تاني أبداً وأكمل المحادثة عادي.`,
      );
    } else {
      // We need info but we already asked. Tell the bot NOT to repeat.
      sys.push(
        `ملاحظة مهمة: العميل لم يرد بعد على طلب البيانات. ` +
          `لا تطلب الاسم أو الرقم مرة أخرى. أكمل المحادثة عادي وانتظر منه البيانات لما يحب.`,
      );
    }
  } else {
    // We have everything — be explicit so the bot doesn't ask redundantly.
    sys.push(
      `معلومات العميل مكتملة (الاسم والرقم محفوظين). ممنوع تسأل عن الاسم أو رقم التليفون مرة أخرى مهما كانت الظروف.`,
    );
  }

  // ---- Wave 9: smart personalization — feed past preferences as memory ----
  // Audit fix #7: suppress this legacy block when Phase 1 memoryBlock is
  // present — memory.ts already mirrors the same facts and produces a more
  // compact, structured block. Saves ~80 tokens per request.
  const hasMemoryBlockEarly = !!(opts.memoryBlock && opts.memoryBlock.trim());
  if (
    !hasMemoryBlockEarly &&
    opts.customerPreferences &&
    opts.customerPreferences !== "{}"
  ) {
    try {
      const prefs = JSON.parse(opts.customerPreferences);
      const lines: string[] = [];
      if (Array.isArray(prefs.products) && prefs.products.length)
        lines.push(
          `- منتجات سأل عنها سابقاً: ${prefs.products.slice(0, 5).join("، ")}`,
        );
      if (Array.isArray(prefs.sizes) && prefs.sizes.length)
        lines.push(`- مقاسات/أحجام: ${prefs.sizes.slice(0, 5).join("، ")}`);
      if (Array.isArray(prefs.colors) && prefs.colors.length)
        lines.push(`- ألوان مفضّلة: ${prefs.colors.slice(0, 5).join("، ")}`);
      if (typeof prefs.budget === "number")
        lines.push(`- ميزانية تقريبية: ${prefs.budget}`);
      if (Array.isArray(prefs.lastTopics) && prefs.lastTopics.length)
        lines.push(
          `- آخر مواضيع نقاش: ${prefs.lastTopics.slice(0, 3).join("، ")}`,
        );
      if (lines.length) {
        sys.push(
          `--- ذاكرة العميل (استخدمها بحذر؛ لا تذكرها صراحة إلا لو سأل) ---\n` +
            lines.join("\n") +
            "\n--- نهاية الذاكرة ---",
        );
      }
    } catch {}
  }

  // ---- Wave 5: humanize hints ----
  if (opts.humanize) {
    sys.push(
      `تعليمات بشرية:
- اكتب بأسلوب موظف خدمة عملاء بشري حقيقي. غيّر بين الجمل والمفردات في كل رد.
- لا تبدأ كل رد بكلمة "أهلاً" أو "بكل تأكيد". نوّع البدايات.
- استخدم جملاً قصيرة ومتدفقة كمحادثة حقيقية، وأحياناً كلمات تأكيد طبيعية مثل "تمام"، "ماشي"، "حاضر"، "أكيد".
- لا تستخدم Markdown. لا تستخدم * إلا نادراً للتأكيد.
- لو الموقف يحتمل، أضف emoji واحد فقط في نهاية الرد، لا أكثر.`,
    );
    const styleHint = buildHumanStyleHint(
      opts.newUserMsg,
      opts.customerLeadScore || 0,
    );
    if (styleHint) sys.push(styleHint);
  }

  // ---- Wave 7: sales persuasion ----
  // Audit fix #7: suppress when Phase 2 salesBlock is present (it carries a
  // more targeted, mode-specific instruction). Saves ~60 tokens per request.
  const hasSalesBlockEarly = !!(opts.salesBlock && opts.salesBlock.trim());
  if (
    !hasSalesBlockEarly &&
    opts.persuasionEnabled &&
    opts.customerLastIntent === "buy"
  ) {
    sys.push(
      `تعليمات بيعية (العميل أبدى نية شراء):
- اظهر لطفاً وحماساً، وثبّت قراره بإيجاز.
- اقترح خطوة عملية واحدة واضحة (مثل: "ابعتلي اسمك ورقمك أحجزلك").
- لو فيه عرض/خصم/كمية محدودة في قاعدة المعرفة، اذكره مرة واحدة فقط بدون مبالغة.`,
    );
  }
  if (opts.negotiationEnabled) {
    const floor = Math.max(0, Math.min(50, opts.negotiationFloorPct ?? 10));
    sys.push(
      `تعليمات تفاوض الأسعار:
- لو العميل طلب خصماً، يُمكنك التلميح إلى مرونة بسيطة، بحدّ أقصى ${floor}% من السعر.
- لا تذكر النسبة بشكل صريح. صياغة مثل "ممكن أتكلم مع الإدارة وأرجعلك بأفضل عرض ممكن" مقبولة.
- لا تجاوز هذا الحد مطلقاً. لو طلب أكثر، اعتذر بلطف ووجّهه لرقم الإدارة.`,
    );
  }

  // ---- Phase 1: inject pre-rendered memory block (summary + facts) ----
  // Placed AFTER the legacy customerPreferences block so it overrides it
  // when both are present (memory.ts mirrors prefs already).
  const hasMemory = !!(opts.memoryBlock && opts.memoryBlock.trim());
  if (hasMemory) {
    sys.push(opts.memoryBlock!.trim());
  }

  // ---- Phase 2: inject ultra-short sales guidance (≤120 tokens) ----
  // Only added when sales-engine.shouldRunSales() returned true AND a
  // persuasion mode was selected. Strict instruction format so the LLM
  // adapts dynamically without templating its reply.
  if (opts.salesBlock && opts.salesBlock.trim()) {
    sys.push(opts.salesBlock.trim());
  }

  // ---- Arabic few-shot examples (compact 2-shot for response style) ----
  // Gated on non-custom modes so merchants with fully custom prompts aren't
  // affected. These examples ground the LLM in Egyptian Arabic response style
  // without consuming significant tokens (~80 total).
  const _modeForShots = (opts.businessMode || "store").trim();
  if (_modeForShots !== "custom") {
    sys.push(
      `أمثلة على أسلوب الرد (لا ترسل هذه الأمثلة، استخدمها فقط كمرجع للأسلوب):
عميل: بكام الشنطة دي؟
أنت: الشنطة متاحة بـ [السعر من قاعدة المعرفة] — وفيها ألوان تانية كمان، عايز تشوف؟

عميل: مش متأكد
أنت: خلّيك معايا ثانية — ايه اللي بيوقفك؟ ممكن نحلّها مع بعض.`,
    );
  }

  const messages: Msg[] = [{ role: "system", content: sys.join("\n\n") }];

  // Phase 3: adaptive history depth based on question complexity.
  //   simple   → 4 turns
  //   medium   → 8 turns
  //   complex  → 16 turns
  // When a memory summary exists we clamp the upper bound (the summary
  // already captures older turns, so 8 is plenty even for complex).
  const complexity = classifyComplexity(
    opts.newUserMsg,
    opts.customerLeadScore || 0,
  );
  let historyLimit = depthForComplexity(complexity);
  if (hasMemory) historyLimit = Math.min(historyLimit, 8);

  // Token-budget guard: if the assembled system prompt already consumes
  // more than 50% of the model context, halve the history limit so we
  // leave room for the model's reply without silent truncation.
  const systemTokens = estimateTokens(sys.join("\n\n"));
  const ctxLimit = modelContextLimit(opts.modelHint);
  if (systemTokens > ctxLimit * 0.5) {
    historyLimit = Math.max(2, Math.floor(historyLimit / 2));
  }

  // Phase 3: drop greetings, acks, and assistant-side duplicates BEFORE we
  // slice. This frees the limited window for high-information turns.
  const compressed = compressHistory(opts.history);
  const recent = compressed.slice(-historyLimit);
  for (const m of recent) {
    if (m.role === "user" || m.role === "assistant") {
      messages.push({
        role: m.role as "user" | "assistant",
        content: m.content,
      });
    }
  }
  messages.push({ role: "user", content: opts.newUserMsg });
  return messages;
}

function buildHumanStyleHint(text: string, leadScore: number): string {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const arabic = (raw.match(/[\u0600-\u06FF]/g) || []).length;
  const latin = (raw.match(/[A-Za-z]/g) || []).length;
  const lower = raw.toLowerCase();
  const hints: string[] = [];

  if (latin > arabic * 1.2 && latin >= 6) {
    hints.push(
      "العميل يكتب بالإنجليزية؛ رد بالإنجليزية البسيطة ما لم يكن السياق العربي أوضح.",
    );
  } else if (/\b(ازيك|عامل ايه|بص|طب|ماشي|اوكي|تمام|يعني)\b/.test(lower)) {
    hints.push(
      "نبرة العميل عامية؛ استخدم عامية مصرية خفيفة وطبيعية بدون مبالغة.",
    );
  } else if (/حضرتك|من فضلك|لو سمحت|please|kindly/i.test(raw)) {
    hints.push("نبرة العميل مهذبة/رسمية؛ حافظ على احترام هادئ بدون جمود.");
  }

  if (raw.length <= 28)
    hints.push("رسالته قصيرة؛ اجعل الرد قصيراً ولا تشرح زيادة.");
  if (/[؟?]\s*$/.test(raw))
    hints.push("أجب على السؤال مباشرة أولاً، ثم اختم بخطوة واحدة واضحة.");
  if (leadScore >= 70)
    hints.push(
      "العميل مؤهل للبيع؛ اختم بسؤال عملي واحد يساعده يكمل الطلب بدون ضغط.",
    );

  if (!hints.length) return "";
  return `تكييف النبرة الفوري: ${hints.slice(0, 3).join(" ")}`;
}

// Detect order/payment intent in a message (simple keyword + LLM hybrid; keyword first for speed)
export function detectOrderIntent(text: string, keywordsCsv: string): boolean {
  const kws = keywordsCsv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const t = text.toLowerCase();
  return kws.some((k) => k && t.includes(k));
}
