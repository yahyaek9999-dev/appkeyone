/** lib/agents/types.ts — Multi-Agent shared types (Phase 2). */
export type AgentName = "sales" | "support" | "crm" | "order" | "billing";

export interface AgentContext {
  userId: string;
  customerId: string | null;
  input: string;
  insights: string[];
  industry: string;
  dialect: string;
  customer: any;
  memory: any;
  walletBalance: number;
}

export interface AgentDecisionResult {
  agent: AgentName;
  decision: string;
  action?: string;
  confidence: number;
  reason: string;
  payload?: Record<string, unknown>;
}

export interface Agent {
  name: AgentName;
  evaluate(ctx: AgentContext): AgentDecisionResult[];
}
