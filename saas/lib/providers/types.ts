// Shared types for the multi-provider AI router.
//
// All providers receive the same OpenAI-style {role, content} message array
// and return a single string (the assistant's reply). Provider-specific
// request shaping (Gemini, Claude) is handled inside each adapter so the
// rest of the codebase remains provider-agnostic.

export type ProviderId =
  | "keyone"
  | "openai"
  | "gemini"
  | "openrouter"
  | "claude"
  | "groq";

export type ChatMsg = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ProviderCallOpts = {
  apiKey: string;
  model?: string | null;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

export type ProviderResult = {
  text: string;
  /** Raw token usage if the provider reports it (best-effort). */
  usage?: { inputTokens?: number; outputTokens?: number };
};

/** Default model picked when the merchant did not override it. Cheap + fast. */
export const DEFAULT_MODELS: Record<Exclude<ProviderId, "keyone">, string> = {
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
  openrouter: "meta-llama/llama-3.3-70b-instruct:free",
  claude: "claude-3-5-haiku-latest",
  groq: "llama-3.1-8b-instant",
};

/** Quality tiers for model selection in the merchant settings UI. */
export type QualityTier = "fast" | "balanced" | "smart";

export const TIER_MODELS: Record<Exclude<ProviderId, "keyone">, Record<QualityTier, string>> = {
  openai:     { fast: "gpt-4o-mini",                             balanced: "gpt-4o",                       smart: "gpt-4.1" },
  claude:     { fast: "claude-3-5-haiku-latest",                 balanced: "claude-3-5-sonnet-20241022",   smart: "claude-opus-4-5" },
  gemini:     { fast: "gemini-2.0-flash",                        balanced: "gemini-1.5-pro",               smart: "gemini-1.5-pro" },
  openrouter: { fast: "meta-llama/llama-3.3-70b-instruct:free", balanced: "openai/gpt-4o",               smart: "anthropic/claude-opus-4" },
  groq:       { fast: "llama-3.1-8b-instant",                    balanced: "llama-3.3-70b-versatile",     smart: "llama-3.3-70b-versatile" },
};

export const TIER_LABELS: Record<QualityTier, { ar: string; description: string }> = {
  fast:     { ar: "سريع",   description: "ردود فورية، تكلفة منخفضة" },
  balanced: { ar: "متوازن", description: "دقة أعلى، مناسب للمبيعات" },
  smart:    { ar: "ذكي",   description: "أعلى دقة، أبطأ قليلاً" },
};

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  keyone: "KEYONE AI (افتراضي)",
  openai: "OpenAI",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  claude: "Anthropic Claude",
  groq: "Groq",
};

/** Returns true if the given string is a recognised provider id. */
export function isProviderId(s: unknown): s is ProviderId {
  return (
    typeof s === "string" &&
    ["keyone", "openai", "gemini", "openrouter", "claude", "groq"].includes(s)
  );
}

/** Normalised error class so callers can detect provider-side problems. */
export class ProviderError extends Error {
  status: number;
  provider: ProviderId;
  retryable: boolean;
  constructor(provider: ProviderId, status: number, message: string, retryable = false) {
    super(`[${provider}] ${status} ${message}`);
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * Decides whether a non-2xx response should be retried by the router.
 * 408 (timeout), 429 (rate limit), and any 5xx are retryable.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}
