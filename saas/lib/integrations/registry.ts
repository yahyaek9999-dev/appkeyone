// Universal Providers — static registry.
//
// Declares every provider per domain and the input fields the settings form
// collects. This is pure data (no fetch, client-safe) so both the dashboard UI
// and the server services read from one source of truth. Adding a provider =
// adding a descriptor here + an adapter in the domain folder.

import type {
  Bilingual,
  ProviderDescriptor,
  ProviderDomain,
  ProviderFieldSpec,
} from "./types";

// ── Field factories (reduce repetition across ~30 providers) ─────────────────

const apiKeyField = (label?: Bilingual): ProviderFieldSpec => ({
  key: "apiKey",
  store: "secret",
  secret: true,
  required: true,
  type: "password",
  label: label || { ar: "مفتاح الـ API", en: "API Key" },
});

const modelField = (placeholder: string, label?: Bilingual): ProviderFieldSpec => ({
  key: "model",
  store: "model",
  required: false,
  type: "text",
  placeholder,
  label: label || { ar: "الموديل (اختياري)", en: "Model (optional)" },
});

const endpointField = (placeholder: string, label?: Bilingual): ProviderFieldSpec => ({
  key: "endpoint",
  store: "endpoint",
  required: true,
  type: "url",
  placeholder,
  label: label || { ar: "رابط الخدمة (Endpoint)", en: "Endpoint URL" },
  help: { ar: "لازم يكون رابط عام https — بيتم التحقق منه أمنياً.", en: "Must be a public https URL — SSRF-validated." },
});

const fromEmailFields = (): ProviderFieldSpec[] => [
  {
    key: "fromEmail",
    store: { config: "fromEmail" },
    required: true,
    type: "text",
    placeholder: "no-reply@yourbrand.com",
    label: { ar: "البريد المرسِل", en: "From Email" },
  },
  {
    key: "fromName",
    store: { config: "fromName" },
    required: false,
    type: "text",
    placeholder: "YourBrand",
    label: { ar: "اسم المرسِل", en: "From Name" },
  },
];

const smsFromField = (placeholder = "+15551234567"): ProviderFieldSpec => ({
  key: "from",
  store: { config: "from" },
  required: true,
  type: "text",
  placeholder,
  label: { ar: "رقم/معرّف المرسِل", en: "Sender (from)" },
});

// ── AI text providers (vault adds failover on top of the legacy Bot config) ──
const AI_PROVIDERS: ProviderDescriptor[] = [
  { id: "openai", domain: "ai", label: "OpenAI", defaultModel: "gpt-4o-mini",
    fields: [apiKeyField(), modelField("gpt-4o-mini")], priceHint: { in: 0.005, out: 0.015 } },
  { id: "claude", domain: "ai", label: "Anthropic Claude", defaultModel: "claude-3-5-haiku-latest",
    fields: [apiKeyField(), modelField("claude-3-5-haiku-latest")], priceHint: { in: 0.003, out: 0.015 } },
  { id: "gemini", domain: "ai", label: "Google Gemini", defaultModel: "gemini-2.0-flash",
    fields: [apiKeyField(), modelField("gemini-2.0-flash")], priceHint: { in: 0.00125, out: 0.005 } },
  { id: "groq", domain: "ai", label: "Groq", defaultModel: "llama-3.1-8b-instant",
    fields: [apiKeyField(), modelField("llama-3.1-8b-instant")], priceHint: { in: 0.0005, out: 0.0008 } },
  { id: "openrouter", domain: "ai", label: "OpenRouter", defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    fields: [apiKeyField(), modelField("meta-llama/llama-3.3-70b-instruct:free")], priceHint: { in: 0.002, out: 0.006 } },
  { id: "grok", domain: "ai", label: "xAI Grok", defaultModel: "grok-2-latest",
    fields: [apiKeyField(), modelField("grok-2-latest")], priceHint: { in: 0.002, out: 0.01 } },
  { id: "custom", domain: "ai", label: "Custom (OpenAI-compatible)", needsEndpoint: true, defaultModel: "",
    fields: [endpointField("https://your-host/v1/chat/completions"), apiKeyField(), modelField("model-id")] },
];

// ── Speech-to-Text providers ─────────────────────────────────────────────────
const SPEECH_PROVIDERS: ProviderDescriptor[] = [
  { id: "whisper", domain: "speech", label: "OpenAI Whisper", defaultModel: "whisper-1",
    fields: [apiKeyField(), modelField("whisper-1")], priceHint: { perUnit: 0.006, unit: "min" } },
  { id: "groq", domain: "speech", label: "Groq Whisper", defaultModel: "whisper-large-v3",
    fields: [apiKeyField(), modelField("whisper-large-v3")], priceHint: { perUnit: 0.0011, unit: "min" } },
  { id: "deepgram", domain: "speech", label: "Deepgram", defaultModel: "nova-2",
    fields: [apiKeyField(), modelField("nova-2")], priceHint: { perUnit: 0.0043, unit: "min" } },
  { id: "assemblyai", domain: "speech", label: "AssemblyAI", defaultModel: "best",
    fields: [apiKeyField(), modelField("best")], priceHint: { perUnit: 0.0062, unit: "min" } },
  { id: "custom", domain: "speech", label: "Custom Speech API", needsEndpoint: true,
    fields: [endpointField("https://your-host/v1/audio/transcriptions"), apiKeyField(), modelField("model-id")] },
];

// ── Image AI providers (generate / analyze) ──────────────────────────────────
const IMAGE_PROVIDERS: ProviderDescriptor[] = [
  { id: "openai", domain: "image", label: "OpenAI Images + Vision", capabilities: ["generate", "analyze"], defaultModel: "gpt-4o-mini",
    fields: [apiKeyField(), modelField("gpt-image-1 / gpt-4o-mini")] },
  { id: "gemini", domain: "image", label: "Gemini Vision", capabilities: ["analyze"], defaultModel: "gemini-2.0-flash",
    fields: [apiKeyField(), modelField("gemini-2.0-flash")] },
  { id: "claude", domain: "image", label: "Claude Vision", capabilities: ["analyze"], defaultModel: "claude-3-5-sonnet-20241022",
    fields: [apiKeyField(), modelField("claude-3-5-sonnet-20241022")] },
  { id: "openrouter", domain: "image", label: "OpenRouter (vision)", capabilities: ["analyze"], defaultModel: "openai/gpt-4o-mini",
    fields: [apiKeyField(), modelField("openai/gpt-4o-mini")] },
  { id: "replicate", domain: "image", label: "Replicate", capabilities: ["generate"], defaultModel: "black-forest-labs/flux-schnell",
    fields: [apiKeyField(), modelField("black-forest-labs/flux-schnell")] },
  { id: "stability", domain: "image", label: "Stability AI", capabilities: ["generate"], defaultModel: "sd3.5-large",
    fields: [apiKeyField(), modelField("sd3.5-large")] },
  { id: "custom", domain: "image", label: "Custom Image API", capabilities: ["generate", "analyze"], needsEndpoint: true,
    fields: [endpointField("https://your-host/v1/images"), apiKeyField(), modelField("model-id")] },
];

// ── SMS providers ────────────────────────────────────────────────────────────
const SMS_PROVIDERS: ProviderDescriptor[] = [
  { id: "twilio", domain: "sms", label: "Twilio",
    fields: [
      { key: "accountSid", store: "publicId", required: true, type: "text", placeholder: "AC…", label: { ar: "Account SID", en: "Account SID" } },
      { key: "authToken", store: "secret", secret: true, required: true, type: "password", label: { ar: "Auth Token", en: "Auth Token" } },
      smsFromField("+15551234567 أو MGxxxx"),
    ] },
  { id: "vonage", domain: "sms", label: "Vonage",
    fields: [
      { key: "apiKey", store: "publicId", required: true, type: "text", label: { ar: "API Key", en: "API Key" } },
      { key: "apiSecret", store: "secret", secret: true, required: true, type: "password", label: { ar: "API Secret", en: "API Secret" } },
      smsFromField("BrandName أو رقم"),
    ] },
  { id: "messagebird", domain: "sms", label: "MessageBird / Bird",
    fields: [apiKeyField(), smsFromField("BrandName أو رقم")] },
  { id: "plivo", domain: "sms", label: "Plivo",
    fields: [
      { key: "authId", store: "publicId", required: true, type: "text", placeholder: "MA…", label: { ar: "Auth ID", en: "Auth ID" } },
      { key: "authToken", store: "secret", secret: true, required: true, type: "password", label: { ar: "Auth Token", en: "Auth Token" } },
      smsFromField("+15551234567"),
    ] },
  { id: "infobip", domain: "sms", label: "Infobip", needsEndpoint: true,
    fields: [
      endpointField("https://xxxxx.api.infobip.com", { ar: "Base URL (من لوحة Infobip)", en: "Base URL (Infobip portal)" }),
      apiKeyField({ ar: "API Key", en: "API Key" }),
      smsFromField("BrandName أو رقم"),
    ] },
  { id: "custom", domain: "sms", label: "Custom SMS Gateway", needsEndpoint: true,
    fields: [endpointField("https://your-gateway/send"), apiKeyField(), smsFromField()] },
];

// ── Email providers ──────────────────────────────────────────────────────────
const EMAIL_PROVIDERS: ProviderDescriptor[] = [
  { id: "smtp", domain: "email", label: "SMTP (custom)", needsEndpoint: true,
    fields: [
      { key: "host", store: "endpoint", required: true, type: "text", placeholder: "smtp.yourhost.com", label: { ar: "خادم SMTP", en: "SMTP Host" } },
      { key: "port", store: { config: "port" }, required: false, type: "number", placeholder: "587", label: { ar: "المنفذ", en: "Port" } },
      { key: "username", store: "publicId", required: false, type: "text", placeholder: "user@yourhost.com", label: { ar: "اسم المستخدم", en: "Username" } },
      { key: "password", store: "secret", secret: true, required: false, type: "password", label: { ar: "كلمة المرور", en: "Password" } },
      ...fromEmailFields(),
    ] },
  { id: "sendgrid", domain: "email", label: "SendGrid",
    fields: [apiKeyField(), ...fromEmailFields()] },
  { id: "resend", domain: "email", label: "Resend",
    fields: [apiKeyField(), ...fromEmailFields()] },
  { id: "mailgun", domain: "email", label: "Mailgun", needsEndpoint: false,
    fields: [
      apiKeyField(),
      { key: "mailgunDomain", store: { config: "domain" }, required: true, type: "text", placeholder: "mg.yourbrand.com", label: { ar: "نطاق Mailgun", en: "Mailgun Domain" } },
      { key: "region", store: { config: "region" }, required: false, type: "text", placeholder: "us | eu", label: { ar: "المنطقة (us/eu)", en: "Region (us/eu)" } },
      ...fromEmailFields(),
    ] },
  { id: "ses", domain: "email", label: "Amazon SES",
    fields: [
      { key: "accessKeyId", store: "publicId", required: true, type: "text", placeholder: "AKIA…", label: { ar: "Access Key ID", en: "Access Key ID" } },
      { key: "secretAccessKey", store: "secret", secret: true, required: true, type: "password", label: { ar: "Secret Access Key", en: "Secret Access Key" } },
      { key: "region", store: { config: "region" }, required: true, type: "text", placeholder: "us-east-1", label: { ar: "المنطقة (Region)", en: "Region" } },
      ...fromEmailFields(),
    ] },
  { id: "postmark", domain: "email", label: "Postmark",
    fields: [apiKeyField({ ar: "Server Token", en: "Server Token" }), ...fromEmailFields()] },
  { id: "brevo", domain: "email", label: "Brevo",
    fields: [apiKeyField(), ...fromEmailFields()] },
];

export const REGISTRY: Record<ProviderDomain, ProviderDescriptor[]> = {
  ai: AI_PROVIDERS,
  speech: SPEECH_PROVIDERS,
  image: IMAGE_PROVIDERS,
  sms: SMS_PROVIDERS,
  email: EMAIL_PROVIDERS,
};

export const DOMAIN_LABELS: Record<ProviderDomain, Bilingual> = {
  ai: { ar: "الذكاء الاصطناعي", en: "AI" },
  speech: { ar: "تحويل الصوت لنص", en: "Voice / Speech-to-Text" },
  image: { ar: "الصور (توليد وتحليل)", en: "Images" },
  sms: { ar: "الرسائل النصية SMS", en: "SMS" },
  email: { ar: "البريد الإلكتروني", en: "Email" },
};

/** URL slug used by the dashboard for each domain. */
export const DOMAIN_SLUGS: Record<ProviderDomain, string> = {
  ai: "ai",
  speech: "voice",
  image: "images",
  sms: "sms",
  email: "email",
};

export const SLUG_TO_DOMAIN: Record<string, ProviderDomain> = {
  ai: "ai",
  voice: "speech",
  speech: "speech",
  images: "image",
  image: "image",
  sms: "sms",
  email: "email",
};

export function getDescriptor(domain: ProviderDomain, provider: string): ProviderDescriptor | null {
  return REGISTRY[domain]?.find((d) => d.id === provider) || null;
}

export function listProviders(domain: ProviderDomain): ProviderDescriptor[] {
  return REGISTRY[domain] || [];
}
