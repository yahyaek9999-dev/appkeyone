/**
 * lib/agents/agents.ts — the five specialized agents (Phase 2). Each is a pure
 * function over the shared AgentContext (reuses Brain classifications + CRM +
 * wallet). Decisions optionally name an Action Engine action.
 */
import type { Agent, AgentContext, AgentDecisionResult } from "./types";

const salesAgent: Agent = {
  name: "sales",
  evaluate(ctx) {
    const out: AgentDecisionResult[] = [];
    if (ctx.insights.includes("BUYING_SIGNAL")) {
      out.push({ agent: "sales", decision: "pursue_close", action: "create_order", confidence: 0.8, reason: "buying signal detected", payload: { customerId: ctx.customerId } });
    }
    if (ctx.insights.includes("PRICE_OBJECTION") || ctx.insights.includes("DISCOUNT_REQUEST")) {
      out.push({ agent: "sales", decision: "handle_objection", action: "schedule_followup", confidence: 0.7, reason: "price objection / discount request", payload: { kind: "hesitation_recovery", customerId: ctx.customerId } });
    }
    return out;
  },
};

const supportAgent: Agent = {
  name: "support",
  evaluate(ctx) {
    const out: AgentDecisionResult[] = [];
    if (ctx.insights.includes("ANGRY_CUSTOMER")) {
      out.push({ agent: "support", decision: "escalate", action: "create_ticket", confidence: 0.85, reason: "angry customer", payload: { severity: "high", reason: "angry_customer", customerId: ctx.customerId } });
    }
    return out;
  },
};

const crmAgent: Agent = {
  name: "crm",
  evaluate(ctx) {
    const out: AgentDecisionResult[] = [];
    if (ctx.insights.includes("VIP_CUSTOMER")) {
      out.push({ agent: "crm", decision: "tag_vip", action: "update_crm", confidence: 0.9, reason: "vip customer", payload: { tag: "VIP", customerId: ctx.customerId } });
    }
    if (ctx.industry && ctx.industry !== "generic") {
      out.push({ agent: "crm", decision: "tag_industry", action: "update_crm", confidence: 0.6, reason: `industry=${ctx.industry}`, payload: { tag: ctx.industry, customerId: ctx.customerId } });
    }
    return out;
  },
};

const orderAgent: Agent = {
  name: "order",
  evaluate(ctx) {
    const out: AgentDecisionResult[] = [];
    if (ctx.insights.includes("RETURNING_CUSTOMER") && ctx.insights.includes("BUYING_SIGNAL")) {
      out.push({ agent: "order", decision: "fast_reorder", action: "create_order", confidence: 0.75, reason: "returning buyer with intent", payload: { customerId: ctx.customerId } });
    }
    return out;
  },
};

const billingAgent: Agent = {
  name: "billing",
  evaluate(ctx) {
    const out: AgentDecisionResult[] = [];
    if (ctx.walletBalance <= 0) {
      out.push({ agent: "billing", decision: "flag_low_balance", confidence: 0.9, reason: "wallet balance is zero", payload: { customerId: ctx.customerId } });
    }
    return out;
  },
};

export const AGENTS: Agent[] = [salesAgent, supportAgent, crmAgent, orderAgent, billingAgent];
