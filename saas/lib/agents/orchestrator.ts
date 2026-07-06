/**
 * lib/agents/orchestrator.ts — Multi-Agent orchestration (Phase 2). Builds the
 * SHARED context once (Brain memory + CRM + wallet), runs all agents, records
 * AgentExecution + AgentDecision, and routes each decision's action through the
 * Action Engine (proposes by default; executes only when explicitly allowed).
 */
import { prisma } from "@/lib/db";
import { detectDialect } from "@/lib/brain/dialect";
import { detectIndustry } from "@/lib/brain/industry";
import { classifyMessage } from "@/lib/brain/classify";
import { AGENTS } from "./agents";
import { executeAction, ACTION_TYPES, type ActionType } from "@/lib/actions/engine";
import type { AgentContext, AgentDecisionResult } from "./types";

export interface OrchestrationResult {
  executionId: string;
  decisions: AgentDecisionResult[];
  actions: Array<{ action: string; status: string; refId: string | null }>;
  agentsRun: string[];
}

export async function runOrchestrator(userId: string, customerId: string | null, input: string, opts: { execute?: boolean } = {}): Promise<OrchestrationResult> {
  const started = Date.now();
  const customer = customerId ? await prisma.customer.findFirst({ where: { id: customerId, userId } }) : null;
  const memory = customerId ? await prisma.brainMemory.findFirst({ where: { customerId, userId } }) : null;
  const wallet = await prisma.wallet.findUnique({ where: { userId } }).catch(() => null);

  const dl = detectDialect(input);
  const ind = detectIndustry(dl.normalized);
  const insights = classifyMessage(dl.normalized, { orderCount: Number((customer as any)?.orderCount || 0), totalOrderValue: Number((customer as any)?.totalOrderValue || 0), vip: Boolean((customer as any)?.vip) }).map((i) => i.type);

  const ctx: AgentContext = {
    userId, customerId, input, insights, industry: String(ind.industry), dialect: dl.dialect,
    customer, memory, walletBalance: wallet?.balanceUsd ?? 0,
  };

  const decisions: AgentDecisionResult[] = [];
  const agentsRun: string[] = [];
  for (const agent of AGENTS) {
    const d = agent.evaluate(ctx);
    if (d.length) { agentsRun.push(agent.name); decisions.push(...d); }
  }

  const exec = await prisma.agentExecution.create({
    data: { userId, customerId: customerId || null, agent: "orchestrator", trigger: "api", input: input.slice(0, 2000), status: "ok", decisionsCount: decisions.length, latencyMs: Date.now() - started },
  });
  for (const d of decisions) {
    await prisma.agentDecision.create({ data: { executionId: exec.id, userId, agent: d.agent, decision: d.decision, action: d.action || null, confidence: d.confidence, reason: d.reason.slice(0, 300), payload: JSON.stringify(d.payload || {}) } }).catch(() => {});
  }

  const actions: Array<{ action: string; status: string; refId: string | null }> = [];
  for (const d of decisions) {
    if (d.action && (ACTION_TYPES as readonly string[]).includes(d.action)) {
      const r = await executeAction({ userId, customerId, actionType: d.action as ActionType, params: d.payload || {}, source: "agent", execute: opts.execute });
      actions.push({ action: d.action, status: r.status, refId: r.refId });
    }
  }
  await prisma.agentExecution.update({ where: { id: exec.id }, data: { actionsCount: actions.length } }).catch(() => {});

  return { executionId: exec.id, decisions, actions, agentsRun };
}

export async function getAgentStats(userId?: string) {
  const where = userId ? { userId } : {};
  const [executions, decisions, byAgent] = await Promise.all([
    prisma.agentExecution.count({ where }),
    prisma.agentDecision.count({ where }),
    prisma.agentDecision.groupBy({ by: ["agent"], where, _count: { agent: true } }),
  ]);
  return { executions, decisions, byAgent: byAgent.map((r) => ({ agent: r.agent, count: r._count.agent })).sort((a, b) => b.count - a.count) };
}
