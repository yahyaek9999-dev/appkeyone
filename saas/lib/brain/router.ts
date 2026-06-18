/**
 * lib/brain/router.ts — Brain AI Router (Phase 9).
 *
 * Execution flow: Memory → Knowledge → Industry → Dialect → Provider → AI →
 * Response. Reuses the existing per-tenant provider config (Bot.aiProvider +
 * encrypted key via botProviderOverride) and the existing chat() failover
 * engine — no provider rebuild. When no external provider/keys are reachable
 * the router returns the assembled business-intelligence envelope (the layer is
 * a BI layer, not a chatbot).
 */
import { prisma } from "@/lib/db";
import { enrichBrainMemory } from "./memory";
import { detectDialect, normalizeMeaning } from "./dialect";
import { detectIndustry, getIndustryBrain } from "./industry";
import { classifyMessage } from "./classify";
import { botProviderOverride } from "@/lib/providers/bot-provider";
import { chat } from "@/lib/llm";

export interface BrainPipelineResult {
  response: string; provider: string; model: string; dialect: string; industry: string;
  insights: string[]; kbUsed: number; usedLLM: boolean; normalized: string;
  memory: any; profile: any;
}

function buildSystemPrompt(hints: string, dialect: string, memory: any, insights: string[]): string {
  const lines = ["You are KEYONE Brain, a business-intelligence sales assistant.", hints];
  if (dialect) lines.push(`Customer dialect: ${dialect} — mirror it in the reply.`);
  if (memory?.summary) lines.push(`Customer memory: ${memory.summary}`);
  if (insights.length) lines.push(`Detected signals: ${insights.join(", ")}.`);
  return lines.join("\n");
}

function buildEnvelope(industryLabel: string, dialect: string, insights: string[]): string {
  return [
    `[KEYONE Brain] القطاع: ${industryLabel}${dialect ? ` | اللهجة: ${dialect}` : ""}`,
    insights.length ? `الإشارات: ${insights.join("، ")}` : "لا توجد إشارات بعد",
    "تم تجهيز سياق الذكاء التجاري (لا يوجد مزوّد AI خارجي مُكوَّن لإنشاء رد نصي).",
  ].join("\n");
}

export async function runBrainPipeline(userId: string, customerId: string | null, input: string): Promise<BrainPipelineResult> {
  // 1. Memory (enrich when we know the customer)
  let enriched: any = null;
  if (customerId) enriched = await enrichBrainMemory(userId, customerId, input).catch(() => null);

  // 4. Dialect + normalized meaning layer
  const dl = detectDialect(input);
  const normalized = dl.normalized || normalizeMeaning(input);

  // 3. Industry brain
  const ind = detectIndustry(normalized);
  const brain = getIndustryBrain(ind.industry);

  // Sales signals
  const insights = classifyMessage(normalized, { orderCount: enriched?.orderCount, vip: enriched?.vip }).map((i) => i.type);

  // 5/6. Provider router (reuse tenant Bot creds) → AI
  const bot = await prisma.bot.findFirst({ where: { userId } }).catch(() => null);
  const override = botProviderOverride(bot);
  let provider = override ? override.provider : "keyone";
  const model = override?.model || "";
  let response = "";
  let usedLLM = false;

  const msgs = [
    { role: "system", content: buildSystemPrompt(brain.promptHints, dl.dialect, enriched?.memory, insights) },
    { role: "user", content: input },
  ];
  try {
    const out: any = await chat(msgs as any, { provider: override, meterUserId: userId, timeoutMs: 20000 });
    const text = typeof out === "string" ? out : (out?.text ?? out?.content ?? out?.message ?? "");
    if (text && String(text).trim()) { response = String(text).trim(); usedLLM = true; provider = override ? override.provider : "keyone"; }
  } catch { usedLLM = false; }

  if (!response) response = buildEnvelope(brain.label.ar, dl.dialect, insights);

  return {
    response, provider, model, dialect: dl.dialect, industry: String(ind.industry), insights,
    kbUsed: enriched?.kbCount ?? 0, usedLLM, normalized,
    memory: enriched?.memory ?? null, profile: enriched?.profile ?? null,
  };
}
