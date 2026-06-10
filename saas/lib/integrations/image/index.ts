// Universal Providers — Image AI domain service (server-only).
//
// analyze: OpenAI Vision, Gemini Vision, Claude Vision, OpenRouter (vision), custom.
// generate: OpenAI Images, Replicate, Stability AI, custom.
// Priority-ordered failover, capability-filtered (analyze vs generate), + ping.

import { safeFetch } from "@/lib/ssrf";
import { runWithFailover } from "../failover";
import { registerService } from "../services";
import { IntegrationError, isRetryableStatus, type FailoverResult, type ResolvedProvider } from "../types";

export type AnalyzeInput = { base64: string; mimetype?: string; prompt?: string };
export type AnalyzeResult = { text: string };
export type GenerateInput = { prompt: string; size?: string };
export type GenerateResult = { url?: string; b64?: string };

const TIMEOUT = Math.max(20_000, Number(process.env.MEDIA_AI_TIMEOUT_MS || 40_000));
function signal(ms = TIMEOUT): AbortSignal | undefined {
  try { return AbortSignal.timeout(ms); } catch { return undefined; }
}
async function readErr(res: Response): Promise<string> {
  try { const j = await res.json(); return j?.error?.message || j?.error || j?.message || JSON.stringify(j).slice(0, 200); }
  catch { try { return (await res.text()).slice(0, 200); } catch { return res.statusText; } }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_PROMPT =
  "حلّل هذه الصورة بالعربية في 2-4 جمل. حدّد نوعها (منتج/فاتورة/إيصال/قائمة/لقطة شاشة/مستند) واذكر التفاصيل المهمة (مبلغ، تاريخ، أصناف، ألوان).";
const has = (p: ResolvedProvider, cap: string) => (p.descriptor.capabilities || []).includes(cap);

// ── Analyze ──────────────────────────────────────────────────────────────────
export async function runAnalyze(p: ResolvedProvider, input: AnalyzeInput): Promise<AnalyzeResult> {
  const mime = input.mimetype || "image/jpeg";
  const dataUrl = `data:${mime};base64,${input.base64}`;
  const prompt = input.prompt || DEFAULT_PROMPT;

  if (p.provider === "openai" || p.provider === "openrouter" || p.provider === "custom") {
    const url = p.provider === "openai" ? "https://api.openai.com/v1/chat/completions"
      : p.provider === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions"
      : p.endpoint;
    if (!url) throw new IntegrationError("image", p.provider, 0, "endpoint_required", false);
    const body = JSON.stringify({
      model: p.model || (p.provider === "openrouter" ? "openai/gpt-4o-mini" : "gpt-4o-mini"),
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: dataUrl } }] }],
      max_tokens: 400,
    });
    const init = { method: "POST", headers: { Authorization: `Bearer ${p.secret}`, "Content-Type": "application/json" }, body, signal: signal() };
    const res = p.provider === "custom" ? await safeFetch(url, init as any) : await fetch(url, init);
    if (!res.ok) throw new IntegrationError("image", p.provider, res.status, await readErr(res), isRetryableStatus(res.status));
    const j = await res.json().catch(() => ({}));
    return { text: j?.choices?.[0]?.message?.content || "" };
  }

  if (p.provider === "gemini") {
    const model = p.model || "gemini-2.0-flash";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(p.secret)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: signal(),
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: input.base64 } }] }] }),
    });
    if (!res.ok) throw new IntegrationError("image", "gemini", res.status, await readErr(res), isRetryableStatus(res.status));
    const j = await res.json().catch(() => ({}));
    return { text: j?.candidates?.[0]?.content?.parts?.map((x: any) => x.text).join("") || "" };
  }

  if (p.provider === "claude") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: signal(),
      headers: { "x-api-key": p.secret, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: p.model || "claude-3-5-sonnet-20241022",
        max_tokens: 400,
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mime, data: input.base64 } }, { type: "text", text: prompt }] }],
      }),
    });
    if (!res.ok) throw new IntegrationError("image", "claude", res.status, await readErr(res), isRetryableStatus(res.status));
    const j = await res.json().catch(() => ({}));
    return { text: j?.content?.map((c: any) => c.text).join("") || "" };
  }

  throw new IntegrationError("image", p.provider, 0, "provider_cannot_analyze", false);
}

// ── Generate ─────────────────────────────────────────────────────────────────
export async function runGenerate(p: ResolvedProvider, input: GenerateInput): Promise<GenerateResult> {
  if (p.provider === "openai" || p.provider === "custom") {
    const url = p.provider === "openai" ? "https://api.openai.com/v1/images/generations" : p.endpoint;
    if (!url) throw new IntegrationError("image", p.provider, 0, "endpoint_required", false);
    const init = {
      method: "POST", headers: { Authorization: `Bearer ${p.secret}`, "Content-Type": "application/json" }, signal: signal(),
      body: JSON.stringify({ model: p.model || "gpt-image-1", prompt: input.prompt, size: input.size || "1024x1024", n: 1 }),
    };
    const res = p.provider === "custom" ? await safeFetch(url, init as any) : await fetch(url, init);
    if (!res.ok) throw new IntegrationError("image", p.provider, res.status, await readErr(res), isRetryableStatus(res.status));
    const j = await res.json().catch(() => ({}));
    const d = j?.data?.[0];
    return { url: d?.url, b64: d?.b64_json };
  }

  if (p.provider === "stability") {
    const model = p.model || "sd3.5-large";
    const form = new FormData();
    form.append("prompt", input.prompt);
    form.append("model", model);
    form.append("output_format", "png");
    const res = await fetch("https://api.stability.ai/v2beta/stable-image/generate/sd3", {
      method: "POST", headers: { Authorization: `Bearer ${p.secret}`, Accept: "application/json" }, body: form, signal: signal(),
    });
    if (!res.ok) throw new IntegrationError("image", "stability", res.status, await readErr(res), isRetryableStatus(res.status));
    const j = await res.json().catch(() => ({}));
    return { b64: j?.image };
  }

  if (p.provider === "replicate") {
    // Create prediction then poll until completed.
    const create = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST", signal: signal(),
      headers: { Authorization: `Token ${p.secret}`, "Content-Type": "application/json", Prefer: "wait" },
      body: JSON.stringify({ version: undefined, model: p.model || "black-forest-labs/flux-schnell", input: { prompt: input.prompt } }),
    });
    if (!create.ok) throw new IntegrationError("image", "replicate", create.status, await readErr(create), isRetryableStatus(create.status));
    let pred = await create.json().catch(() => ({}));
    const deadline = Date.now() + TIMEOUT;
    while (pred?.status && pred.status !== "succeeded" && pred.status !== "failed" && Date.now() < deadline) {
      await sleep(2000);
      const r = await fetch(pred?.urls?.get, { headers: { Authorization: `Token ${p.secret}` }, signal: signal(10000) });
      pred = await r.json().catch(() => ({}));
    }
    if (pred.status !== "succeeded") throw new IntegrationError("image", "replicate", 0, pred?.error || "generation_failed", false);
    const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
    return { url: typeof out === "string" ? out : undefined };
  }

  throw new IntegrationError("image", p.provider, 0, "provider_cannot_generate", false);
}

async function pingImage(p: ResolvedProvider): Promise<void> {
  let res: Response;
  if (p.provider === "openai") res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${p.secret}` }, signal: signal(10000) });
  else if (p.provider === "openrouter") res = await fetch("https://openrouter.ai/api/v1/auth/key", { headers: { Authorization: `Bearer ${p.secret}` }, signal: signal(10000) });
  else if (p.provider === "gemini") res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(p.secret)}`, { signal: signal(10000) });
  else if (p.provider === "claude") res = await fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": p.secret, "anthropic-version": "2023-06-01" }, signal: signal(10000) });
  else if (p.provider === "replicate") res = await fetch("https://api.replicate.com/v1/account", { headers: { Authorization: `Token ${p.secret}` }, signal: signal(10000) });
  else if (p.provider === "stability") res = await fetch("https://api.stability.ai/v1/user/account", { headers: { Authorization: `Bearer ${p.secret}` }, signal: signal(10000) });
  else if (p.provider === "custom") { const { assertPublicHttpUrl } = await import("@/lib/ssrf"); await assertPublicHttpUrl(p.endpoint); return; }
  else throw new IntegrationError("image", p.provider, 0, "unsupported_image_provider", false);
  if (!res.ok) throw new IntegrationError("image", p.provider, res.status, await readErr(res), false);
}

/** Analyze an image across analyze-capable providers (failover). */
export async function analyzeImageWithFailover(userId: string, input: AnalyzeInput): Promise<FailoverResult<AnalyzeResult>> {
  return runWithFailover(userId, "image", (p) => runAnalyze(p, input), { operation: "analyze", filter: (p) => has(p, "analyze") });
}

/** Generate an image across generate-capable providers (failover). */
export async function generateImageWithFailover(userId: string, input: GenerateInput): Promise<FailoverResult<GenerateResult>> {
  return runWithFailover(userId, "image", (p) => runGenerate(p, input), { operation: "generate", filter: (p) => has(p, "generate") });
}

registerService({ domain: "image", ping: pingImage });
