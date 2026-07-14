// AI Control Center — raw LLM capability tester (streaming / tool calling / reasoning).
//
// Isolated from the live chat pipeline on purpose: no Customer/Conversation/
// Message rows, no usage billing, no order-detection side effects. It exists
// so admins can verify the provider layer's newer capabilities (WP1) work
// end-to-end against the tenant's real configured provider, without any risk
// to the WhatsApp send path.
import type { ChatMsg, ToolDef, ToolChoice } from "@/lib/providers/types";
import { aiChatWithFailover } from "@/lib/integrations/ai";

export type LlmTestArgs = {
  message: string;
  systemPrompt?: string;
  tools?: ToolDef[];
  toolChoice?: ToolChoice;
  reasoning?: boolean;
  reasoningBudget?: number;
};

export type LlmTestResult =
  | {
      ok: true;
      text: string;
      provider: string;
      toolCalls?: { id: string; name: string; arguments: Record<string, any> }[];
      thinkingText?: string;
      usage?: { inputTokens?: number; outputTokens?: number };
    }
  | { ok: false; reason: string };

export async function runLlmTest(
  userId: string,
  args: LlmTestArgs,
  onChunk?: (chunk: string) => void
): Promise<LlmTestResult> {
  const message = (args.message || "").toString().slice(0, 2000).trim();
  if (message.length < 1) return { ok: false, reason: "empty_message" };

  const messages: ChatMsg[] = [];
  const sys = (args.systemPrompt || "").toString().slice(0, 4000).trim();
  if (sys) messages.push({ role: "system", content: sys });
  messages.push({ role: "user", content: message });

  const tools = Array.isArray(args.tools) ? args.tools.slice(0, 8) : undefined;

  const r = await aiChatWithFailover(userId, messages, {
    temperature: 0.5,
    maxTokens: 900,
    timeoutMs: 45000,
    tools,
    toolChoice: args.toolChoice,
    thinking: args.reasoning ? { enabled: true, budgetTokens: args.reasoningBudget ?? 2048 } : undefined,
    ...(onChunk ? { stream: true, onStreamChunk: onChunk } : {}),
  });

  if (!r.ok) return { ok: false, reason: r.reason };
  return {
    ok: true,
    text: r.result.text,
    provider: r.provider,
    toolCalls: r.result.toolCalls,
    thinkingText: r.result.thinkingText,
    usage: r.result.usage,
  };
}
