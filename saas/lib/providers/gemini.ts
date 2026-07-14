// Google Gemini provider adapter. Uses the v1beta REST API.
//
// Endpoint: POST https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key=KEY
// Streaming: same path, ":streamGenerateContent?alt=sse&key=KEY" — SSE of partial responses.
// Wire format differs from OpenAI: messages → contents[] with role + parts.
// "system" messages are folded into a single systemInstruction field.
// Tool calls -> parts[].functionCall = { name, args }.

import {
  ChatMsg,
  DEFAULT_MODELS,
  ProviderCallOpts,
  ProviderError,
  ProviderResult,
  ToolCall,
  isRetryableStatus,
} from "./types";

function toGeminiTools(opts: ProviderCallOpts) {
  if (!opts.tools?.length) return {};
  const mode =
    opts.toolChoice === "none" ? "NONE" :
    opts.toolChoice === "required" ? "ANY" :
    typeof opts.toolChoice === "object" ? "ANY" :
    "AUTO";
  const out: any = {
    tools: [{ functionDeclarations: opts.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }],
    toolConfig: { functionCallingConfig: { mode, ...(typeof opts.toolChoice === "object" ? { allowedFunctionNames: [opts.toolChoice.name] } : {}) } },
  };
  return out;
}

function extractFromParts(parts: any[] | undefined): { text: string; toolCalls?: ToolCall[] } {
  if (!Array.isArray(parts)) return { text: "" };
  let text = "";
  const toolCalls: ToolCall[] = [];
  for (const p of parts) {
    if (typeof p?.text === "string") text += p.text;
    if (p?.functionCall) {
      toolCalls.push({ id: p.functionCall.name || "", name: p.functionCall.name || "", arguments: p.functionCall.args || {} });
    }
  }
  return { text, toolCalls: toolCalls.length ? toolCalls : undefined };
}

function buildBody(messages: ChatMsg[], opts: ProviderCallOpts) {
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const body: any = { contents };
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };
  const gen: any = {};
  if (typeof opts.temperature === "number") gen.temperature = opts.temperature;
  if (typeof opts.maxTokens === "number") gen.maxOutputTokens = opts.maxTokens;
  if (Object.keys(gen).length) body.generationConfig = gen;
  Object.assign(body, toGeminiTools(opts));
  return body;
}

export async function callGemini(
  messages: ChatMsg[],
  opts: ProviderCallOpts
): Promise<ProviderResult> {
  const model = opts.model || DEFAULT_MODELS.gemini;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60000);
  const useStream = !!(opts.stream && opts.onStreamChunk);
  try {
    const body = buildBody(messages, opts);
    const method = useStream ? "streamGenerateContent" : "generateContent";
    const streamParam = useStream ? "&alt=sse" : "";
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${method}?key=${encodeURIComponent(opts.apiKey)}${streamParam}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const detail = await safeReadError(res);
      throw new ProviderError("gemini", res.status, detail, isRetryableStatus(res.status));
    }
    if (useStream && res.body) {
      return await readGeminiStream(res.body, opts.onStreamChunk!);
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const { text, toolCalls } = extractFromParts(parts);
    const um = data?.usageMetadata;
    const usage = um
      ? { inputTokens: um.promptTokenCount, outputTokens: um.candidatesTokenCount }
      : undefined;
    return { text, usage, ...(toolCalls ? { toolCalls } : {}) };
  } finally {
    clearTimeout(t);
  }
}

/** Parses Gemini's `alt=sse` streamGenerateContent response — each `data:` line is a partial GenerateContentResponse. */
async function readGeminiStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: string) => void
): Promise<ProviderResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  let usage: ProviderResult["usage"];
  const toolCalls: ToolCall[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload) continue;
      let evt: any;
      try { evt = JSON.parse(payload); } catch { continue; }
      const parts = evt?.candidates?.[0]?.content?.parts;
      const chunk = extractFromParts(parts);
      if (chunk.text) {
        text += chunk.text;
        onChunk(chunk.text);
      }
      if (chunk.toolCalls) toolCalls.push(...chunk.toolCalls);
      const um = evt?.usageMetadata;
      if (um) usage = { inputTokens: um.promptTokenCount, outputTokens: um.candidatesTokenCount };
    }
  }

  return { text, usage, ...(toolCalls.length ? { toolCalls } : {}) };
}

async function safeReadError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j?.error?.message || JSON.stringify(j).slice(0, 300);
  } catch {
    try { return (await res.text()).slice(0, 300); } catch { return res.statusText; }
  }
}
