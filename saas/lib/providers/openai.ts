// OpenAI provider adapter. Uses bare fetch — no SDK.
//
// Endpoint: https://api.openai.com/v1/chat/completions
// Auth:     Authorization: Bearer <key>
// Body:     { model, messages, temperature, max_tokens, tools?, tool_choice?, stream? }

import {
  ChatMsg,
  DEFAULT_MODELS,
  ProviderCallOpts,
  ProviderError,
  ProviderResult,
  ToolCall,
  isRetryableStatus,
} from "./types";

function toOpenAiTools(opts: ProviderCallOpts) {
  if (!opts.tools?.length) return {};
  const tool_choice =
    opts.toolChoice === "none" ? "none" :
    opts.toolChoice === "required" ? "required" :
    typeof opts.toolChoice === "object" ? { type: "function", function: { name: opts.toolChoice.name } } :
    "auto";
  return {
    tools: opts.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    })),
    tool_choice,
  };
}

function parseToolCalls(raw: any[] | undefined): ToolCall[] | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined;
  return raw.map((tc: any) => {
    const rawArgs = tc?.function?.arguments ?? "";
    let args: Record<string, any> = {};
    try { args = rawArgs ? JSON.parse(rawArgs) : {}; } catch { /* keep rawArguments below */ }
    return { id: tc?.id || "", name: tc?.function?.name || "", arguments: args, rawArguments: rawArgs };
  });
}

export async function callOpenAI(
  messages: ChatMsg[],
  opts: ProviderCallOpts
): Promise<ProviderResult> {
  const model = opts.model || DEFAULT_MODELS.openai;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60000);
  const useStream = !!(opts.stream && opts.onStreamChunk);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        ...(typeof opts.temperature === "number" ? { temperature: opts.temperature } : {}),
        ...(typeof opts.maxTokens === "number" ? { max_tokens: opts.maxTokens } : {}),
        ...toOpenAiTools(opts),
        ...(useStream ? { stream: true, stream_options: { include_usage: true } } : {}),
      }),
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const detail = await safeReadError(res);
      throw new ProviderError("openai", res.status, detail, isRetryableStatus(res.status));
    }
    if (useStream && res.body) {
      return await readOpenAiStream(res.body, opts.onStreamChunk!);
    }
    const data = await res.json();
    const msg = data?.choices?.[0]?.message;
    const text: string = msg?.content ?? "";
    const usage = data?.usage
      ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
      : undefined;
    const toolCalls = parseToolCalls(msg?.tool_calls);
    return { text, usage, ...(toolCalls ? { toolCalls } : {}) };
  } finally {
    clearTimeout(t);
  }
}

/** Parses an OpenAI-compatible SSE chat-completions stream, forwarding text deltas and assembling the final result (including any streamed tool-call deltas). */
async function readOpenAiStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: string) => void
): Promise<ProviderResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  let usage: ProviderResult["usage"];
  const toolAcc = new Map<number, { id: string; name: string; args: string }>();

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
      if (payload === "[DONE]") continue;
      let evt: any;
      try { evt = JSON.parse(payload); } catch { continue; }
      const delta = evt?.choices?.[0]?.delta;
      if (delta?.content) {
        text += delta.content;
        onChunk(delta.content);
      }
      if (Array.isArray(delta?.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const cur = toolAcc.get(idx) || { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name = tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          toolAcc.set(idx, cur);
        }
      }
      if (evt?.usage) {
        usage = { inputTokens: evt.usage.prompt_tokens, outputTokens: evt.usage.completion_tokens };
      }
    }
  }

  const toolCalls: ToolCall[] | undefined = toolAcc.size
    ? Array.from(toolAcc.values()).map((tc) => {
        let args: Record<string, any> = {};
        try { args = tc.args ? JSON.parse(tc.args) : {}; } catch { /* keep rawArguments */ }
        return { id: tc.id, name: tc.name, arguments: args, rawArguments: tc.args };
      })
    : undefined;

  return { text, usage, ...(toolCalls ? { toolCalls } : {}) };
}

async function safeReadError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j?.error?.message || JSON.stringify(j).slice(0, 300);
  } catch {
    try { return (await res.text()).slice(0, 300); } catch { return res.statusText; }
  }
}
