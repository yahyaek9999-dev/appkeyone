// Universal Providers — Speech-to-Text domain service (server-only).
//
// Adapters: OpenAI Whisper, Groq Whisper, Deepgram, AssemblyAI, custom
// (OpenAI-compatible). Arabic + auto language detection; AssemblyAI/Deepgram
// handle long audio (async/streaming). Priority-ordered failover + ping.

import { safeFetch } from "@/lib/ssrf";
import { runWithFailover } from "../failover";
import { registerService } from "../services";
import { IntegrationError, isRetryableStatus, type FailoverResult, type ResolvedProvider } from "../types";

export type TranscribeInput = { base64: string; mimetype?: string; language?: string };
export type TranscribeResult = { text: string; language?: string };

const TIMEOUT = Math.max(15_000, Number(process.env.MEDIA_AI_TIMEOUT_MS || 30_000));

function extFor(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("webm")) return "webm";
  return "ogg";
}
function signal(ms = TIMEOUT): AbortSignal | undefined {
  try { return AbortSignal.timeout(ms); } catch { return undefined; }
}
async function readErr(res: Response): Promise<string> {
  try { const j = await res.json(); return j?.error?.message || j?.error || j?.message || JSON.stringify(j).slice(0, 200); }
  catch { try { return (await res.text()).slice(0, 200); } catch { return res.statusText; } }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// OpenAI-compatible multipart transcription (Whisper, Groq, custom).
async function openAiCompatible(url: string, p: ResolvedProvider, input: TranscribeInput, defaultModel: string): Promise<TranscribeResult> {
  const buf = Buffer.from(input.base64, "base64");
  const mime = input.mimetype || "audio/ogg";
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: mime }), `audio.${extFor(mime)}`);
  fd.append("model", p.model || defaultModel);
  if (input.language) fd.append("language", input.language);
  const res = await (url.startsWith("http") && p.provider === "custom"
    ? safeFetch(url, { method: "POST", headers: { Authorization: `Bearer ${p.secret}` }, body: fd as any, signal: signal() } as any)
    : fetch(url, { method: "POST", headers: { Authorization: `Bearer ${p.secret}` }, body: fd, signal: signal() }));
  if (!res.ok) throw new IntegrationError("speech", p.provider, res.status, await readErr(res), isRetryableStatus(res.status));
  const j = await res.json().catch(() => ({}));
  return { text: j.text || "", language: j.language };
}

async function deepgram(p: ResolvedProvider, input: TranscribeInput): Promise<TranscribeResult> {
  const buf = Buffer.from(input.base64, "base64");
  const params = new URLSearchParams({ model: p.model || "nova-2", smart_format: "true" });
  if (input.language) params.set("language", input.language);
  else params.set("detect_language", "true");
  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: { Authorization: `Token ${p.secret}`, "Content-Type": input.mimetype || "audio/ogg" },
    body: buf,
    signal: signal(),
  });
  if (!res.ok) throw new IntegrationError("speech", "deepgram", res.status, await readErr(res), isRetryableStatus(res.status));
  const j = await res.json().catch(() => ({}));
  const alt = j?.results?.channels?.[0]?.alternatives?.[0];
  return { text: alt?.transcript || "", language: j?.results?.channels?.[0]?.detected_language };
}

async function assemblyai(p: ResolvedProvider, input: TranscribeInput): Promise<TranscribeResult> {
  const buf = Buffer.from(input.base64, "base64");
  // 1) upload
  const up = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST", headers: { Authorization: p.secret, "Content-Type": "application/octet-stream" }, body: buf, signal: signal(),
  });
  if (!up.ok) throw new IntegrationError("speech", "assemblyai", up.status, await readErr(up), isRetryableStatus(up.status));
  const { upload_url } = await up.json();
  // 2) request transcript (auto language detection unless specified)
  const body: any = { audio_url: upload_url };
  if (input.language) body.language_code = input.language;
  else body.language_detection = true;
  const tr = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST", headers: { Authorization: p.secret, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: signal(),
  });
  if (!tr.ok) throw new IntegrationError("speech", "assemblyai", tr.status, await readErr(tr), isRetryableStatus(tr.status));
  const { id } = await tr.json();
  // 3) poll (long-audio friendly) — bounded
  const deadline = Date.now() + Math.max(TIMEOUT, 60_000);
  while (Date.now() < deadline) {
    await sleep(2500);
    const r = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, { headers: { Authorization: p.secret }, signal: signal() });
    const j = await r.json().catch(() => ({}));
    if (j.status === "completed") return { text: j.text || "", language: j.language_code };
    if (j.status === "error") throw new IntegrationError("speech", "assemblyai", 0, j.error || "transcription_error", false);
  }
  throw new IntegrationError("speech", "assemblyai", 0, "transcription_timeout", true);
}

export async function runTranscribe(p: ResolvedProvider, input: TranscribeInput): Promise<TranscribeResult> {
  if (!p.secret && p.provider !== "custom") throw new IntegrationError("speech", p.provider, 0, "missing api key", false);
  switch (p.provider) {
    case "whisper": return openAiCompatible("https://api.openai.com/v1/audio/transcriptions", p, input, "whisper-1");
    case "groq": return openAiCompatible("https://api.groq.com/openai/v1/audio/transcriptions", p, input, "whisper-large-v3");
    case "deepgram": return deepgram(p, input);
    case "assemblyai": return assemblyai(p, input);
    case "custom": {
      if (!p.endpoint) throw new IntegrationError("speech", "custom", 0, "endpoint_required", false);
      return openAiCompatible(p.endpoint, p, input, "whisper-1");
    }
    default: throw new IntegrationError("speech", p.provider, 0, "unsupported_speech_provider", false);
  }
}

async function pingSpeech(p: ResolvedProvider): Promise<void> {
  let res: Response;
  if (p.provider === "whisper") res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${p.secret}` }, signal: signal(10000) });
  else if (p.provider === "groq") res = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${p.secret}` }, signal: signal(10000) });
  else if (p.provider === "deepgram") res = await fetch("https://api.deepgram.com/v1/projects", { headers: { Authorization: `Token ${p.secret}` }, signal: signal(10000) });
  else if (p.provider === "assemblyai") res = await fetch("https://api.assemblyai.com/v2/transcript?limit=1", { headers: { Authorization: p.secret }, signal: signal(10000) });
  else if (p.provider === "custom") { const { assertPublicHttpUrl } = await import("@/lib/ssrf"); await assertPublicHttpUrl(p.endpoint); return; }
  else throw new IntegrationError("speech", p.provider, 0, "unsupported_speech_provider", false);
  if (!res.ok) throw new IntegrationError("speech", p.provider, res.status, await readErr(res), false);
}

/** Transcribe audio across the tenant's configured providers with failover. */
export async function transcribeWithFailover(userId: string, input: TranscribeInput): Promise<FailoverResult<TranscribeResult>> {
  return runWithFailover(userId, "speech", (p) => runTranscribe(p, input), { operation: "transcribe" });
}

registerService({ domain: "speech", ping: pingSpeech });
