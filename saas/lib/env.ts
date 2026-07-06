/**
 * lib/env.ts — KEYONE SaaS environment validator
 *
 * Usage:
 *   import { validateEnv, env } from "@/lib/env";
 *   validateEnv(); // call once at app startup (e.g. app/layout.tsx)
 *
 * Rules:
 *   - REQUIRED vars throw in production if missing/empty.
 *   - OPTIONAL vars warn to stderr if they look like example/placeholder values.
 *   - Safe to import in Next.js server components (no side-effects on import;
 *     only validateEnv() call triggers checks).
 *   - `env` object gives typed, coerced access to every config value.
 */

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const IS_PROD = process.env.NODE_ENV === "production";

/** Known placeholder values that indicate the var was never filled in. */
const PLACEHOLDER_PATTERNS = [
  /^REPLACE_WITH/i,
  /^change[-_]?me/i,
  /^change[-_]?this/i,
  /^your[-_]/i,
  /^\[PASSWORD\]$/i,
  /^xxx+$/i,
  /^todo$/i,
  // Public default secrets shipped in source — never allow them in production.
  /^dev-internal-secret/i,
  /^dev-shared-secret/i,
];

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((re) => re.test(value.trim()));
}

function getEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

// ---------------------------------------------------------------------------
// Variable declarations
// ---------------------------------------------------------------------------

/**
 * Variables that MUST be present and non-empty in production.
 * Startup throws if any are missing.
 */
const REQUIRED_IN_PROD = [
  "AUTH_SECRET",
  "DATABASE_URL",
  "SAAS_INTERNAL_SECRET",
] as const;

type RequiredKey = (typeof REQUIRED_IN_PROD)[number];

/**
 * Optional variables: if detected as placeholder/example values a warning
 * is printed but the app continues.
 */
const WARN_IF_PLACEHOLDER: readonly string[] = [
  "LLM_API_KEY",
  "WHATSAPP_SHARED_SECRET",
];

/**
 * Optional variables: warn if completely absent in production.
 */
const WARN_IF_ABSENT_IN_PROD: readonly string[] = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SENTRY_DSN",
  "LLM_API_URL",
  "WHATSAPP_SERVICE_URL",
];

// ---------------------------------------------------------------------------
// validateEnv()
// ---------------------------------------------------------------------------

let _validated = false;

/**
 * Validates environment variables at startup.
 *
 * Call this ONCE from app/layout.tsx or a top-level server component.
 * Subsequent calls are no-ops (idempotent).
 *
 * @throws {Error} In production if any REQUIRED variable is missing/empty.
 */
export function validateEnv(): void {
  if (_validated) return;
  _validated = true;

  const errors: string[] = [];
  const warnings: string[] = [];

  // ---- Required in production ----
  for (const key of REQUIRED_IN_PROD) {
    const value = getEnv(key);
    if (!value) {
      const msg = `[env] REQUIRED variable "${key}" is missing or empty.`;
      if (IS_PROD) {
        errors.push(msg);
      } else {
        warnings.push(`${msg} (non-production: continuing with defaults)`);
      }
      continue;
    }

    // Extra checks per variable
    if (key === "AUTH_SECRET") {
      if (value.length < 32) {
        const msg = `[env] AUTH_SECRET is too short (${value.length} chars; need ≥ 32). Generate with: openssl rand -hex 32`;
        IS_PROD ? errors.push(msg) : warnings.push(msg);
      }
      if (isPlaceholder(value)) {
        const msg = `[env] AUTH_SECRET looks like a placeholder. Replace with a real secret.`;
        IS_PROD ? errors.push(msg) : warnings.push(msg);
      }
    }

    if (key === "SAAS_INTERNAL_SECRET") {
      if (value.length < 16) {
        const msg = `[env] SAAS_INTERNAL_SECRET is too short (${value.length} chars; need ≥ 16).`;
        IS_PROD ? errors.push(msg) : warnings.push(msg);
      }
      if (isPlaceholder(value)) {
        const msg = `[env] SAAS_INTERNAL_SECRET looks like a placeholder. Replace with a real secret.`;
        IS_PROD ? errors.push(msg) : warnings.push(msg);
      }
    }
  }

  // ---- Warn if placeholder ----
  for (const key of WARN_IF_PLACEHOLDER) {
    const value = getEnv(key);
    if (value && isPlaceholder(value)) {
      warnings.push(`[env] "${key}" looks like a placeholder value. Update before going live.`);
    }
  }

  // ---- Warn if absent in production ----
  if (IS_PROD) {
    for (const key of WARN_IF_ABSENT_IN_PROD) {
      if (!getEnv(key)) {
        warnings.push(`[env] "${key}" is not set; using built-in default. Consider setting it explicitly.`);
      }
    }
  }

  // ---- Feature-flag coherence checks ----
  if (getEnv("ENABLE_BULLMQ") === "1" && !getEnv("UPSTASH_REDIS_URL")) {
    warnings.push(`[env] ENABLE_BULLMQ=1 but UPSTASH_REDIS_URL is not set. BullMQ workers will fail to connect.`);
  }

  if (getEnv("META_CLOUD_ENABLED") === "1" && !getEnv("META_APP_SECRET")) {
    warnings.push(`[env] META_CLOUD_ENABLED=1 but META_APP_SECRET is not set. Webhook signature verification will fail.`);
  }

  // Premium feature enforcement is INERT until FREE_TIER_ENFORCEMENT=1. With it
  // off in production, any no-subscription / expired / legacy user gets every paid
  // capability for free (the fail-open path). Make that loud so it is a conscious
  // go-live decision, not a silent revenue leak.
  if (IS_PROD && getEnv("FREE_TIER_ENFORCEMENT") !== "1") {
    warnings.push(`[env] FREE_TIER_ENFORCEMENT is not "1" in production — premium feature gating is INERT for non-k_* / no-subscription users (they get all paid features free). Set FREE_TIER_ENFORCEMENT=1 after confirming every paying customer has an active subscription.`);
  }

  // ---- Emit warnings ----
  for (const w of warnings) {
    console.warn(w);
  }

  // ---- Throw on hard errors ----
  if (errors.length > 0) {
    const msg = [
      "",
      "╔══════════════════════════════════════════════════════════╗",
      "║         KEYONE startup failed — missing env vars         ║",
      "╚══════════════════════════════════════════════════════════╝",
      ...errors.map((e) => `  ✗ ${e}`),
      "",
      "  Copy saas/.env.example → saas/.env and fill in real values.",
      "  Generate secrets with:  openssl rand -hex 32",
      "",
    ].join("\n");
    throw new Error(msg);
  }
}

// ---------------------------------------------------------------------------
// env — typed config object
// ---------------------------------------------------------------------------

/**
 * Typed, validated access to all environment configuration.
 *
 * This object is lazily evaluated (reads process.env at access time)
 * so it works correctly with Next.js hot-reload in development.
 */
export const env = {
  // ---- Core ----
  get nodeEnv(): "development" | "test" | "production" {
    const v = process.env.NODE_ENV;
    if (v === "test" || v === "production") return v;
    return "development";
  },
  get isProd(): boolean {
    return process.env.NODE_ENV === "production";
  },
  get isDev(): boolean {
    return process.env.NODE_ENV !== "production";
  },
  get port(): number {
    return parseInt(process.env.PORT || "3000", 10);
  },
  get siteUrl(): string {
    return getEnv("NEXT_PUBLIC_SITE_URL") || "http://localhost:3000";
  },

  // ---- Auth ----
  get authSecret(): string {
    return getEnv("AUTH_SECRET") || "dev-secret-please-change-min-32-chars-long";
  },

  // ---- Database ----
  get databaseUrl(): string {
    return getEnv("DATABASE_URL") || "file:./prisma/dev.db";
  },
  get postgresUrl(): string | undefined {
    return getEnv("POSTGRES_URL");
  },
  get postgresDirectUrl(): string | undefined {
    return getEnv("POSTGRES_DIRECT_URL");
  },

  // ---- Redis (Upstash) ----
  get upstashRedisRestUrl(): string | undefined {
    return getEnv("UPSTASH_REDIS_REST_URL");
  },
  get upstashRedisRestToken(): string | undefined {
    return getEnv("UPSTASH_REDIS_REST_TOKEN");
  },
  get upstashRedisUrl(): string | undefined {
    return getEnv("UPSTASH_REDIS_URL");
  },

  // ---- LLM ----
  get llmApiUrl(): string {
    // mse_ai_api removed — no localhost fallback; empty unless explicitly set.
    return getEnv("LLM_API_URL") || "";
  },
  get llmApiUrls(): string[] {
    const multi = (getEnv("LLM_API_URLS") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return multi.length > 0 ? multi : env.llmApiUrl ? [env.llmApiUrl] : [];
  },
  get llmApiKey(): string {
    return getEnv("LLM_API_KEY") || "change-secret-key-2026";
  },
  get llmModel(): string {
    return getEnv("LLM_MODEL") || "gpt-4o-mini";
  },
  get llmMaxConcurrent(): number {
    return Math.max(1, parseInt(getEnv("LLM_MAX_CONCURRENT") || "3", 10));
  },

  // ---- WhatsApp service ----
  get whatsappServiceUrl(): string {
    return getEnv("WHATSAPP_SERVICE_URL") || "http://127.0.0.1:3001";
  },
  get saasInternalSecret(): string {
    return getEnv("SAAS_INTERNAL_SECRET") || "dev-internal-secret-change-me";
  },
  get whatsappSharedSecret(): string {
    return getEnv("WHATSAPP_SHARED_SECRET") || "dev-shared-secret-change-me";
  },

  // ---- Sentry ----
  get sentryDsn(): string | undefined {
    return getEnv("NEXT_PUBLIC_SENTRY_DSN");
  },
  get sentryOrg(): string {
    return getEnv("SENTRY_ORG") || "keyone";
  },
  get sentryProject(): string {
    return getEnv("SENTRY_PROJECT") || "keyone";
  },
  get sentryAuthToken(): string | undefined {
    return getEnv("SENTRY_AUTH_TOKEN");
  },

  // ---- Meta Cloud API ----
  get metaCloudEnabled(): boolean {
    return getEnv("META_CLOUD_ENABLED") === "1";
  },
  get metaAppSecret(): string | undefined {
    return getEnv("META_APP_SECRET");
  },
  get metaGraphVersion(): string {
    return getEnv("META_GRAPH_VERSION") || "v20.0";
  },

  // ---- Media / Vision ----
  get openaiApiKey(): string | undefined {
    return getEnv("OPENAI_API_KEY");
  },
  get whisperApiUrl(): string {
    return getEnv("WHISPER_API_URL") || "https://api.openai.com/v1/audio/transcriptions";
  },
  get visionApiUrl(): string {
    return getEnv("VISION_API_URL") || "https://api.openai.com/v1/chat/completions";
  },
  get visionModel(): string {
    return getEnv("VISION_MODEL") || "gpt-4o-mini";
  },

  // ---- Feature flags ----
  get enableBullmq(): boolean {
    return getEnv("ENABLE_BULLMQ") === "1";
  },
  get enableSessionHibernation(): boolean {
    return getEnv("ENABLE_SESSION_HIBERNATION") === "1";
  },
  get enableSnapshotCache(): boolean {
    return getEnv("ENABLE_SNAPSHOT_CACHE") === "1";
  },
  get enableMessageCoalescing(): boolean {
    return getEnv("ENABLE_MESSAGE_COALESCING") === "1";
  },
  get enableChromiumOptimization(): boolean {
    return getEnv("ENABLE_CHROMIUM_OPTIMIZATION") === "1";
  },
  get enableBackgroundOffloading(): boolean {
    return getEnv("ENABLE_BACKGROUND_OFFLOADING") === "1";
  },

  // ---- Anti-ban tuning ----
  get antiBanPerMin(): number {
    return Math.max(6, parseInt(getEnv("ANTI_BAN_PER_MIN") || "12", 10));
  },
  get antiBanPer10m(): number {
    return Math.max(40, parseInt(getEnv("ANTI_BAN_PER_10M") || "80", 10));
  },
  get antiBanNewChats10m(): number {
    return Math.max(15, parseInt(getEnv("ANTI_BAN_NEW_CHATS_10M") || "25", 10));
  },
  get antiBanDailySoftCap(): number {
    return Math.max(200, parseInt(getEnv("ANTI_BAN_DAILY_SOFT_CAP") || "600", 10));
  },
  get antiBanCooldownMs(): number {
    return Math.max(30_000, parseInt(getEnv("ANTI_BAN_COOLDOWN_MS") || "90000", 10));
  },

  // ---- Cache tuning ----
  get kbCacheTtlMs(): number {
    return Math.max(5_000, parseInt(getEnv("KB_CACHE_TTL_MS") || "60000", 10));
  },
  get kbCacheMax(): number {
    return Math.max(32, parseInt(getEnv("KB_CACHE_MAX") || "256", 10));
  },
  get memoryExtractEvery(): number {
    return Math.max(5, parseInt(getEnv("MEMORY_EXTRACT_EVERY") || "20", 10));
  },
  get memoryExtractTimeoutMs(): number {
    return Math.max(10_000, parseInt(getEnv("MEMORY_EXTRACT_TIMEOUT_MS") || "25000", 10));
  },
} as const;

// Type helpers for consumers
export type Env = typeof env;
