// Anthropic Claude provider adapter.
//
// Endpoint: POST https://api.anthropic.com/v1/messages
// Auth:     x-api-key: <key>
// Headers:  anthropic-version: 2023-06-01
// Wire:     "system" is a top-level field; messages keep role user|assistant.
//           Tool use -> content blocks {type:"tool_use", id, name, input}.
//           Extended thinking -> content blocks {type:"thinking", thinking}.

import {
  ChatMsg,
  DEFAULT_MODELS,
  ProviderCallOpts,
  ProviderError,
  ProviderResult,
  ToolCall,
  isRetryableStatus,
} from "./types";

function toClaudeToolChoice(opts: ProviderCallOpts): any {
  if (opts.toolChoice === "required") return { type: "any" };
  if (typeof opts.toolChoice === "object") return { type: "tool", name: opts.toolChoice.name };
  return { type: "auto" };
}

function buildBody(messages: ChatMsg[], opts: ProviderCallOpts, model: string, stream: boolean) {
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const conv = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const thinking = opts.thinking?.enabled;
  const budgetTokens = opts.thinking?.budgetTokens ?? 2048;
  // Anthropic requires max_tokens to exceed the thinking budget.
  const maxTokens = thinking ? Math.max(opts.maxTokens ?? 1024, budgetTokens + 1024) : (opts.maxTokens ?? 1024);

  const body: any = { model, messages: conv, max_tokens: maxTokens };
  if (systemText) body.system = systemText;
  // Anthropic rejects temperature when thinking is enabled.
  if (typeof opts.temperature === "number" && !thinking) body.temperature = opts.temperature;
  if (opts.tools?.length && opts.toolChoice !== "none") {
    body.tools = opts.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
    body.tool_choice = toClaudeToolChoice(opts);
  }
  if (thinking) body.thinking = { type: "enabled", budget_tokens: budgetTokens };
  if (stream) body.stream = true;
  return body;
}

export async function callClaude(
  messages: ChatMsg[],
  opts: ProviderCallOpts
): Promise<ProviderResult> {
  const model = opts.model || DEFAULT_MODELS.claude;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60000);
  const useStream = !!(opts.stream && opts.onStreamChunk);
  try {
    const body = buildBody(messages, opts, model, useStream);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const detail = await safeReadError(res);
      throw new ProviderError("claude", res.status, detail, isRetryableStatus(res.status));
    }
    if (useStream && res.body) {
      return await readClaudeStream(res.body, opts.onStreamChunk!);
    }
    const data = await res.json();
    const blocks = data?.content;
    const { text, thinkingText, toolCalls } = splitBlocks(blocks);
    const usage = data?.usage
      ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }
      : undefined;
    return { text, usage, ...(thinkingText ? { thinkingText } : {}), ...(toolCalls ? { toolCalls } : {}) };
  } finally {
    clearTimeout(t);
  }
}

function splitBlocks(blocks: any[] | undefined): { text: string; thinkingText?: string; toolCalls?: ToolCall[] } {
  if (!Array.isArray(blocks)) return { text: "" };
  let text = "";
  let thinkingText = "";
  const toolCalls: ToolCall[] = [];
  for (const b of blocks) {
    if (b?.type === "text") text += b.text || "";
    else if (b?.type === "thinking") thinkingText += b.thinking || "";
    else if (b?.type === "tool_use") {
      toolCalls.push({ id: b.id || "", name: b.name || "", arguments: b.input && typeof b.input === "object" ? b.input : {} });
    }
  }
  return { text, thinkingText: thinkingText || undefined, toolCalls: toolCalls.length ? toolCalls : undefined };
}

/** Parses Anthropic's `text/event-stream` response for /v1/messages (content_block_delta events per block index). */
async function readClaudeStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: string) => void
): Promise<ProviderResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  let thinkingText = "";
  let usage: ProviderResult["usage"];
  let inputTokens: number | undefined;
  const blockKind = new Map<number, string>();
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
      if (!payload) continue;
      let evt: any;
      try { evt = JSON.parse(payload); } catch { continue; }
      switch (evt?.type) {
        case "message_start":
          inputTokens = evt?.message?.usage?.input_tokens;
          break;
        case "content_block_start": {
          const idx = evt.index ?? 0;
          const cb = evt.content_block;
          blockKind.set(idx, cb?.type || "text");
          if (cb?.type === "tool_use") toolAcc.set(idx, { id: cb.id || "", name: cb.name || "", args: "" });
          break;
        }
        case "content_block_delta": {
          const idx = evt.index ?? 0;
          const kind = blockKind.get(idx) || "text";
          const delta = evt.delta;
          if (delta?.type === "text_delta" && delta.text) {
            text += delta.text;
            onChunk(delta.text);
          } else if (delta?.type === "thinking_delta" && delta.thinking) {
            thinkingText += delta.thinking;
          } else if (delta?.type === "input_json_delta" && kind === "tool_use") {
            const cur = toolAcc.get(idx) || { id: "", name: "", args: "" };
            cur.args += delta.partial_json || "";
            toolAcc.set(idx, cur);
          }
          break;
        }
        case "message_delta":
          if (evt?.usage?.output_tokens != null) {
            usage = { inputTokens, outputTokens: evt.usage.output_tokens };
          }
          break;
        default:
          break;
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

  return {
    text,
    usage,
    ...(thinkingText ? { thinkingText } : {}),
    ...(toolCalls ? { toolCalls } : {}),
  };
}

async function safeReadError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j?.error?.message || JSON.stringify(j).slice(0, 300);
  } catch {
    try { return (await res.text()).slice(0, 300); } catch { return res.statusText; }
  }
}
