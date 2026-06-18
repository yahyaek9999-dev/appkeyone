/**
 * lib/actions/engine.ts — Action Engine (Phase 3). Lets the Brain/agents execute
 * real actions by reusing EXISTING systems (orders, CRM, escalations, follow-ups,
 * QR reservations, broadcasts). Every action is logged (ActionExecution) + audited
 * (ActionAudit). Default mode = PROPOSE (no mutation); real execution is gated by
 * ACTION_ENGINE_EXECUTE. NEVER touches the WhatsApp send pipeline (create_broadcast
 * only creates a credit_queued draft).
 */
import { prisma } from "@/lib/db";
import { actionFlags } from "./flags";

export const ACTION_TYPES = [
  "create_order", "update_order", "create_ticket", "update_crm",
  "schedule_followup", "create_reservation", "assign_agent", "create_broadcast",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export interface ActionRequest {
  userId: string; customerId?: string | null; actionType: ActionType;
  params?: Record<string, any>; source?: string; execute?: boolean;
}
export interface ActionResult {
  id: string; actionType: string; status: string; dryRun: boolean;
  refId: string | null; result: any; error: string | null;
}

function safeArr(v: any): string[] { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } }

async function audit(actionExecutionId: string, userId: string, level: string, message: string, payload?: any) {
  await prisma.actionAudit.create({ data: { actionExecutionId, userId, level, message, payload: JSON.stringify(payload || {}) } }).catch(() => {});
}

export async function executeAction(req: ActionRequest): Promise<ActionResult> {
  const willExecute = Boolean(req.execute) && actionFlags.execute;
  const exec = await prisma.actionExecution.create({
    data: {
      userId: req.userId, customerId: req.customerId || null, actionType: req.actionType,
      status: willExecute ? "executing" : "proposed", source: req.source || "agent",
      dryRun: !willExecute, params: JSON.stringify(req.params || {}),
    },
  });
  await audit(exec.id, req.userId, "info", willExecute ? "executing" : "proposed", { actionType: req.actionType });

  if (!willExecute) {
    await prisma.actionExecution.update({ where: { id: exec.id }, data: { status: "proposed" } });
    return { id: exec.id, actionType: req.actionType, status: "proposed", dryRun: true, refId: null, result: {}, error: null };
  }

  let refId: string | null = null, result: any = {}, error: string | null = null, status = "executed";
  try {
    const r = await runExecutor(req);
    refId = r.refId; result = r.result;
  } catch (e: any) {
    status = "failed"; error = String(e?.message || e).slice(0, 300);
  }
  await prisma.actionExecution.update({ where: { id: exec.id }, data: { status, refId, result: JSON.stringify(result), error } });
  await audit(exec.id, req.userId, status === "failed" ? "error" : "info", status, { refId, error });
  return { id: exec.id, actionType: req.actionType, status, dryRun: false, refId, result, error };
}

async function runExecutor(req: ActionRequest): Promise<{ refId: string | null; result: any }> {
  const p = req.params || {}; const userId = req.userId; const customerId = req.customerId || null;
  switch (req.actionType) {
    case "update_crm": {
      if (!customerId) throw new Error("customerId_required");
      const data: any = {};
      if (p.tag) {
        const c = await prisma.customer.findFirst({ where: { id: customerId, userId } });
        const tags = safeArr((c as any)?.tags);
        if (!tags.includes(String(p.tag))) tags.push(String(p.tag));
        data.tags = JSON.stringify(tags);
      }
      if (p.note) data.notes = String(p.note).slice(0, 2000);
      await prisma.customer.updateMany({ where: { id: customerId, userId }, data });
      return { refId: customerId, result: { updated: Object.keys(data) } };
    }
    case "assign_agent": {
      if (!customerId) throw new Error("customerId_required");
      await prisma.customer.updateMany({ where: { id: customerId, userId }, data: { assignedAdmin: String(p.assignee || "agent").slice(0, 80) } });
      return { refId: customerId, result: { assignedAdmin: p.assignee || "agent" } };
    }
    case "schedule_followup": {
      if (!customerId) throw new Error("customerId_required");
      const ft = await prisma.followUpTask.create({ data: { userId, customerId, kind: String(p.kind || "manual"), status: "queued", dueAt: p.dueAt ? new Date(p.dueAt) : new Date(Date.now() + 3600000), context: JSON.stringify(p.context || {}) } as any });
      return { refId: ft.id, result: { followUpId: ft.id } };
    }
    case "create_reservation": {
      const r = await prisma.qrReservation.create({ data: { userId, purpose: String(p.purpose || "session"), status: "reserved", windowStart: p.windowStart ? new Date(p.windowStart) : new Date(Date.now() + 600000), windowEnd: p.windowEnd ? new Date(p.windowEnd) : new Date(Date.now() + 3600000), durationMin: Number(p.durationMin || 30) } });
      return { refId: r.id, result: { reservationId: r.id } };
    }
    case "create_order": {
      const o = await prisma.order.create({ data: { userId, customerId: customerId || undefined, customerName: String(p.customerName || ""), customerPhone: String(p.customerPhone || ""), total: Number(p.total || 0), status: "pending", source: "agent" } as any });
      return { refId: o.id, result: { orderId: o.id } };
    }
    case "update_order": {
      if (!p.orderId) throw new Error("orderId_required");
      await prisma.order.updateMany({ where: { id: String(p.orderId), userId }, data: { status: String(p.status || "confirmed") } });
      return { refId: String(p.orderId), result: { status: p.status || "confirmed" } };
    }
    case "create_ticket": {
      if (!customerId) throw new Error("customerId_required");
      const conv = await prisma.conversation.findFirst({ where: { customerId } });
      const t = await prisma.escalationTicket.create({ data: { userId, customerId, conversationId: conv?.id || "", reason: String(p.reason || "agent_escalation"), status: "open", severity: String(p.severity || "medium") } as any });
      return { refId: t.id, result: { ticketId: t.id } };
    }
    case "create_broadcast": {
      const b = await prisma.broadcast.create({ data: { userId, title: String(p.title || "Agent Broadcast"), template: String(p.template || "").slice(0, 4000), audience: String(p.audience || "all"), status: "credit_queued", total: 0 } as any });
      return { refId: b.id, result: { broadcastId: b.id, status: "credit_queued" } };
    }
    default:
      throw new Error("unknown_action");
  }
}

export async function getActionStats(userId?: string) {
  const where = userId ? { userId } : {};
  const [total, byType, byStatus] = await Promise.all([
    prisma.actionExecution.count({ where }),
    prisma.actionExecution.groupBy({ by: ["actionType"], where, _count: { actionType: true } }),
    prisma.actionExecution.groupBy({ by: ["status"], where, _count: { status: true } }),
  ]);
  return {
    total,
    byType: byType.map((r) => ({ actionType: r.actionType, count: r._count.actionType })).sort((a, b) => b.count - a.count),
    byStatus: byStatus.map((r) => ({ status: r.status, count: r._count.status })),
  };
}
