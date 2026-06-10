// Universal Providers — shared types.
//
// One credential vault (TenantProviderCredential) + one registry of provider
// descriptors drives every integration domain. The registry declares which
// input fields each provider needs and where each value is stored, so a single
// generic settings form can configure all ~30 providers without bespoke UI.
//
// Storage mapping (TenantProviderCredential columns):
//   secret   -> secretEnc   (AES-256-GCM)   primary secret (API key / SMTP password / token)
//   secret2  -> secret2Enc  (AES-256-GCM)   secondary secret (AWS secret, ...)
//   publicId -> publicId     (plain)         non-secret id (Account SID, AWS key id, ...)
//   endpoint -> endpoint     (plain)         custom base URL / SMTP host (SSRF-validated)
//   model    -> model        (plain)         default model / voice
//   config:<k> -> configJson[k] (plain)      provider-specific extras (fromEmail, region, ...)

export type ProviderDomain = "ai" | "speech" | "image" | "sms" | "email";

export const PROVIDER_DOMAINS: ProviderDomain[] = ["ai", "speech", "image", "sms", "email"];

/** Health status persisted on the credential row. */
export type ProviderStatus = "unknown" | "healthy" | "degraded" | "down";

export type Bilingual = { ar: string; en: string };

/** Where a collected form value is persisted on the credential row. */
export type FieldStore =
  | "secret"
  | "secret2"
  | "publicId"
  | "endpoint"
  | "model"
  | { config: string };

export type ProviderFieldSpec = {
  /** Stable key used in the form payload `values[key]`. */
  key: string;
  /** Storage target on TenantProviderCredential. */
  store: FieldStore;
  label: Bilingual;
  placeholder?: string;
  /** Required to enable the provider (validated server-side). */
  required?: boolean;
  /** Secret fields are masked on GET and only overwritten when a new value is sent. */
  secret?: boolean;
  type?: "text" | "password" | "number" | "url";
  help?: Bilingual;
};

/** Static description of one provider within a domain. */
export type ProviderDescriptor = {
  id: string; // "openai", "twilio", ...
  domain: ProviderDomain;
  label: string; // human label, e.g. "OpenAI"
  /** Custom/self-hosted endpoint → must pass SSRF validation before any fetch. */
  needsEndpoint?: boolean;
  /** Default model / voice when the tenant does not override. */
  defaultModel?: string;
  /** Domain sub-capabilities (image: ["generate","analyze"]). */
  capabilities?: string[];
  /** Input fields the settings form collects. */
  fields: ProviderFieldSpec[];
  docsUrl?: string;
  /** Best-effort cost hint surfaced in the dashboard (USD). */
  priceHint?: { in?: number; out?: number; perUnit?: number; unit?: string };
};

/** A fully-resolved provider ready to execute: descriptor + decrypted material. */
export type ResolvedProvider = {
  credId: string | null; // null for legacy/env fallback sources
  domain: ProviderDomain;
  provider: string;
  descriptor: ProviderDescriptor;
  priority: number;
  source: "vault" | "legacy" | "env";
  status: ProviderStatus;
  lastCheckAt: Date | null;
  // Decrypted material:
  secret: string;
  secret2: string;
  publicId: string;
  endpoint: string;
  model: string;
  config: Record<string, any>;
};

/** Operation names recorded in ProviderCallLog / used for failover semantics. */
export type ProviderOperation =
  | "chat"
  | "transcribe"
  | "generate"
  | "analyze"
  | "send"
  | "health";

/**
 * Normalized provider error. Mirrors lib/providers/types.ProviderError so the
 * universal failover loop can treat every domain identically.
 */
export class IntegrationError extends Error {
  status: number;
  retryable: boolean;
  provider: string;
  domain: ProviderDomain;
  constructor(
    domain: ProviderDomain,
    provider: string,
    status: number,
    message: string,
    retryable = false,
  ) {
    super(`[${domain}:${provider}] ${status} ${message}`);
    this.domain = domain;
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
  }
}

/** 408 (timeout), 429 (rate limit), and any 5xx are retryable → try next provider. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

/** Result of a failover run: either a success from one provider, or graceful disable. */
export type FailoverSuccess<T> = {
  ok: true;
  disabled?: false;
  provider: string;
  source: ResolvedProvider["source"];
  result: T;
  attempts: number;
};
export type FailoverDisabled = {
  ok: false;
  disabled: true;
  reason: "no_provider_configured" | "all_providers_failed";
  /** Last error message (redacted) when reason === all_providers_failed. */
  detail?: string;
};
export type FailoverResult<T> = FailoverSuccess<T> | FailoverDisabled;

/** True when a feature is off for this tenant (no key) — callers degrade gracefully. */
export function isDisabled<T>(r: FailoverResult<T>): r is FailoverDisabled {
  return r.ok === false && r.disabled === true;
}
