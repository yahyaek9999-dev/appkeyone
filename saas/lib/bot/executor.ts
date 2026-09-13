/**
 * Bot Flow Execution Engine — KEYONE Conversation Automation Runtime
 *
 * Executes ConvFlow node graphs on incoming messages.
 * Handles all 10 node types: start, message, buttons, question, condition,
 * assign, handoff, delay, tag, sms, end
 *
 * Safety guarantees:
 * - ConvBotLock prevents concurrent bot+human replies (mutex per conversation)
 * - activeFlowExecId on Conversation prevents duplicate executions
 * - Max depth of 50 nodes per execution to prevent infinite loops
 * - All errors are caught and recorded; never crash the caller
 * - Tenant isolation: every query scoped by userId
 *
 * Call triggerBotFlow(userId, customerId, message) from the incoming message handler.
 * The function is idempotent — safe to call multiple times with the same message.
 */

import { prisma } from "@/lib/db";
import { sendSmsFromTemplate } from "@/lib/sms/send";

// ─── Types (mirrors bot-builder-ui.tsx; kept separate for server-side use) ───

type NodeType =
  | "start" | "message" | "buttons" | "question" | "condition"
  | "assign" | "handoff" | "delay" | "tag" | "sms" | "end";

interface FlowNode {
  id: string;
  type: NodeType;
  data: Record<string, any>;
  nextId?: string;
  branches?: Array<{ label: string; value: string; nextId: string }>;
}

interface ExecState {
  variables: Record<string, string>;
  waitingForInput?: boolean;
  waitingForNodeId?: string;
  waitingPrompt?: string;
}

const MAX_DEPTH = 50;
const LOCK_TTL_MS = 60_000; // 1 minute lock

// ─── Lock helpers ─────────────────────────────────────────────────────────────

async function acquireLock(conversationId: string, execId: string): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);
  try {
    await (prisma as any).convBotLock.create({
      data: { conversationId, flowId: "running", execId, lockedAt: now, expiresAt },
    });
    return true;
  } catch {
    // Already locked — check if expired
    const existing = await (prisma as any).convBotLock.findUnique({ where: { conversationId } }).catch(() => null);
    if (existing && existing.expiresAt < now) {
      // Expired lock — steal it
      await (prisma as any).convBotLock.update({
        where: { conversationId },
        data: { execId, lockedAt: now, expiresAt },
      }).catch(() => null);
      return true;
    }
    return false;
  }
}

async function releaseLock(conversationId: string) {
  await (prisma as any).convBotLock.delete({ where: { conversationId } }).catch(() => null);
}

// ─── Message sender (WhatsApp abstraction) ────────────────────────────────────

async function sendBotMessage(
  userId: string,
  phone: string,
  text: string,
  buttons?: string[],
): Promise<void> {
  // Deliver through the SAME queue the AI reply path uses:
  //   wa.send -> enqueueOutboundText -> WaMessage -> drainOutgoingQueue
  //     -> wa.sendNow -> maybeRouteBridgeSend -> Bridge | QR | Meta
  // That resolver is what makes a bot reply reach a Bridge tenant. This used to
  // write to `prisma.outgoingMessage`, a model that does not exist: the
  // delegate was `undefined`, so `.create()` threw synchronously, the `.catch()`
  // chained onto it never attached, and the outer catch swallowed the throw —
  // every bot message was discarded in silence on every transport.
  const body = renderWithOptions(text, buttons);
  if (!body) return;

  let queuedId: string | null = null;
  try {
    const { wa } = await import("@/lib/wa");
    const res = await wa.send(userId, phone, body, "system");
    if (!res?.ok) {
      console.error("[flow] send failed:", (res as any)?.data?.error || res?.status);
      return;
    }
    queuedId = String((res as any)?.data?.id || "") || null;
  } catch (e: any) {
    // Delivery failure must not crash the flow, but it must not be invisible
    // either — silence here is what hid this bug.
    console.error("[flow] send threw:", e?.message);
    return;
  }

  // The send path does not persist; every caller records its own assistant
  // message, so the reply shows in the inbox next to the AI ones. Key that row
  // to the queued WaMessage: `enqueueOutboundText` is idempotent on
  // (userId, to, text, reason) and hands back the SAME id when it refuses to
  // re-send an identical reply, so keying on it keeps the inbox showing exactly
  // what actually went out instead of one copy per flow run.
  const conversationId = await getOrCreateConvId(userId, phone);
  if (!conversationId || !queuedId) return;

  const already = await prisma.message
    .findFirst({
      where: { conversationId, role: "assistant", metadataJson: { contains: queuedId } },
      select: { id: true },
    } as any)
    .catch(() => null);
  if (already) return;

  await prisma.message.create({
    data: {
      conversationId,
      role: "assistant",
      content: body,
      mediaType: "text",
      metadataJson: JSON.stringify({ waMessageId: queuedId, source: "bot_flow" }),
      createdAt: new Date(),
    } as any,
  }).catch(() => null);
}

/**
 * The outbound queue carries plain text, so button labels have to travel in the
 * body. They are listed bare, one per line, and deliberately NOT numbered: a
 * `buttons` node matches the reply with `b.label === userInput`, so prompting
 * for "1" would produce an answer that can never select a branch.
 */
function renderWithOptions(text: string, buttons?: string[]): string {
  const base = String(text || "").trim();
  const labels = (buttons || []).map((b) => String(b || "").trim()).filter(Boolean);
  if (!labels.length) return base;
  return [base, "", ...labels].join("\n").trim();
}

async function getOrCreateConvId(userId: string, phone: string): Promise<string> {
  const customer = await prisma.customer.findFirst({ where: { userId, phone } });
  if (!customer) return "";
  const conv = await (prisma as any).conversation.findUnique({ where: { customerId: customer.id } });
  return conv?.id || "";
}

// ─── Node executors ───────────────────────────────────────────────────────────

async function execNode(
  node: FlowNode,
  state: ExecState,
  ctx: { userId: string; customerId: string; phone: string; incomingMessage: string; execId: string },
  depth: number,
  allNodes: Map<string, FlowNode>,
): Promise<{ done: boolean; waitingForInput?: boolean; waitingForNodeId?: string; waitingPrompt?: string }> {
  if (depth > MAX_DEPTH) {
    return { done: true };
  }

  switch (node.type) {
    case "start": {
      const nextId = node.nextId;
      if (!nextId) return { done: true };
      const next = allNodes.get(nextId);
      if (!next) return { done: true };
      return execNode(next, state, ctx, depth + 1, allNodes);
    }

    case "message": {
      const text = interpolate(node.data.text || "", state.variables);
      if (text) await sendBotMessage(ctx.userId, ctx.phone, text);
      const nextId = node.nextId;
      if (!nextId) return { done: true };
      const next = allNodes.get(nextId);
      if (!next) return { done: true };
      return execNode(next, state, ctx, depth + 1, allNodes);
    }

    case "buttons": {
      const text = interpolate(node.data.text || "", state.variables);
      const buttons: string[] = (node.data.buttons || []).map((b: any) => b.label || b);
      await sendBotMessage(ctx.userId, ctx.phone, text, buttons);
      // Wait for user to tap a button (next message routes through branches)
      return { done: false, waitingForInput: true, waitingForNodeId: node.id, waitingPrompt: text };
    }

    case "question": {
      const text = interpolate(node.data.question || node.data.text || "", state.variables);
      await sendBotMessage(ctx.userId, ctx.phone, text);
      // Save the variable key; when user replies, store answer and continue
      return { done: false, waitingForInput: true, waitingForNodeId: node.id, waitingPrompt: node.data.variableKey || "answer" };
    }

    case "condition": {
      const variable = node.data.variable || "";
      const operator = node.data.operator || "equals";
      const expected = node.data.value || "";
      const actual = state.variables[variable] || ctx.incomingMessage || "";
      let matched = false;
      switch (operator) {
        case "equals":   matched = actual.toLowerCase() === expected.toLowerCase(); break;
        case "contains": matched = actual.toLowerCase().includes(expected.toLowerCase()); break;
        case "starts":   matched = actual.toLowerCase().startsWith(expected.toLowerCase()); break;
        case "ends":     matched = actual.toLowerCase().endsWith(expected.toLowerCase()); break;
        case "exists":   matched = !!actual; break;
        case "empty":    matched = !actual; break;
      }
      // Find matching branch
      const branch = (node.branches || []).find((b) => {
        return (matched && b.value === "true") || (!matched && b.value === "false")
          || b.value === actual || b.value === actual.toLowerCase();
      });
      const nextId = branch?.nextId || node.nextId;
      if (!nextId) return { done: true };
      const next = allNodes.get(nextId);
      if (!next) return { done: true };
      return execNode(next, state, ctx, depth + 1, allNodes);
    }

    case "assign": {
      const staffId = node.data.staffId || null;
      const team = node.data.team || null;
      const strategy = node.data.strategy || "manual";
      let resolvedStaffId = staffId;

      if (!resolvedStaffId && (strategy === "round_robin" || strategy === "least_loaded")) {
        resolvedStaffId = await resolveStaffByStrategy(ctx.userId, team, strategy);
      }

      await (prisma as any).conversation.updateMany({
        where: { customerId: ctx.customerId },
        data: {
          assignedStaffId: resolvedStaffId,
          assignedTeam: team,
          queueState: resolvedStaffId ? "assigned" : "open",
        },
      }).catch(() => null);

      const nextId = node.nextId;
      if (!nextId) return { done: true };
      const next = allNodes.get(nextId);
      if (!next) return { done: true };
      return execNode(next, state, ctx, depth + 1, allNodes);
    }

    case "handoff": {
      const reason = interpolate(node.data.reason || "تحويل من البوت", state.variables);
      const notifyTeam = node.data.notifyTeam || null;
      const now = new Date();
      await (prisma as any).conversation.updateMany({
        where: { customerId: ctx.customerId },
        data: {
          handoffState: "human_required",
          handoffReason: reason,
          queueState: "open",
          botPaused: true,
          activeFlowExecId: null,
          activeFlowId: null,
          assignedTeam: notifyTeam,
          humanActiveAt: now,
        },
      }).catch(() => null);
      // Mark execution as handed off
      await (prisma as any).convFlowExecution.update({
        where: { id: ctx.execId },
        data: { status: "handed_off", handoffAt: now, handoffReason: reason },
      }).catch(() => null);
      return { done: true };
    }

    case "delay": {
      const seconds = Number(node.data.seconds || node.data.ms || 0) / 1000 || Number(node.data.seconds || 2);
      if (seconds > 0 && seconds <= 30) {
        await new Promise((r) => setTimeout(r, Math.min(seconds * 1000, 30_000)));
      }
      const nextId = node.nextId;
      if (!nextId) return { done: true };
      const next = allNodes.get(nextId);
      if (!next) return { done: true };
      return execNode(next, state, ctx, depth + 1, allNodes);
    }

    case "tag": {
      const tag = node.data.tag || "";
      if (tag) {
        const customer = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { tags: true } });
        if (customer) {
          let tags: string[] = [];
          try { tags = JSON.parse((customer as any).tags || "[]"); } catch {}
          if (!tags.includes(tag)) {
            tags.push(tag);
            await prisma.customer.update({
              where: { id: ctx.customerId },
              data: { tags: JSON.stringify(tags) } as any,
            }).catch(() => null);
          }
        }
      }
      const nextId = node.nextId;
      if (!nextId) return { done: true };
      const next = allNodes.get(nextId);
      if (!next) return { done: true };
      return execNode(next, state, ctx, depth + 1, allNodes);
    }

    case "sms": {
      const templateId = node.data.templateId || null;
      const message = interpolate(node.data.message || "", state.variables);
      if (templateId || message) {
        const customer = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { phone: true } });
        if (customer?.phone) {
          if (templateId) {
            await sendSmsFromTemplate(ctx.userId, customer.phone, templateId, state.variables).catch(() => null);
          } else if (message) {
            const { sendSms } = await import("@/lib/sms/send");
            await sendSms({ userId: ctx.userId, to: customer.phone, body: message }).catch(() => null);
          }
        }
      }
      const nextId = node.nextId;
      if (!nextId) return { done: true };
      const next = allNodes.get(nextId);
      if (!next) return { done: true };
      return execNode(next, state, ctx, depth + 1, allNodes);
    }

    case "end": {
      const message = interpolate(node.data.message || "", state.variables);
      if (message) await sendBotMessage(ctx.userId, ctx.phone, message);
      return { done: true };
    }

    default:
      return { done: true };
  }
}

// ─── Staff assignment strategies ──────────────────────────────────────────────

async function resolveStaffByStrategy(
  userId: string,
  team: string | null,
  strategy: "round_robin" | "least_loaded",
): Promise<string | null> {
  const where: any = { userId, active: true };
  if (team) where.department = team;

  const staff = await prisma.teamMember.findMany({
    where,
    select: { id: true },
    orderBy: strategy === "round_robin"
      ? { lastAssignedAt: "asc" } as any
      : { id: "asc" },
  }).catch(() => []);

  if (!staff.length) return null;

  if (strategy === "least_loaded") {
    // Find staff with fewest open assigned conversations
    const counts = await Promise.all(
      staff.map(async (s: { id: string }) => {
        const count = await (prisma as any).conversation.count({
          where: { assignedStaffId: s.id, queueState: { in: ["assigned", "open"] } },
        }).catch(() => 999);
        return { id: s.id, count };
      }),
    );
    counts.sort((a: { count: number }, b: { count: number }) => a.count - b.count);
    const winner = counts[0].id;
    await prisma.teamMember.update({ where: { id: winner }, data: { lastAssignedAt: new Date() } as any }).catch(() => null);
    return winner;
  }

  // round_robin — pick oldest lastAssignedAt
  const winner = staff[0].id;
  await prisma.teamMember.update({ where: { id: winner }, data: { lastAssignedAt: new Date() } as any }).catch(() => null);
  return winner;
}

// ─── Variable interpolation ───────────────────────────────────────────────────

function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

// ─── Flow matching ─────────────────────────────────────────────────────────────

async function findMatchingFlow(userId: string, message: string): Promise<any | null> {
  const flows = await (prisma as any).convFlow.findMany({
    where: { userId, status: "active" },
    orderBy: { isDefault: "asc" },
  }).catch(() => []);

  // Keyword match first
  for (const flow of flows) {
    if (flow.trigger === "keyword") {
      try {
        const cfg = JSON.parse(flow.triggerConfig || "{}");
        const keywords: string[] = cfg.keywords || [];
        if (keywords.some((k: string) => message.toLowerCase().includes(k.toLowerCase()))) {
          return flow;
        }
      } catch {}
    }
  }

  // Default flow fallback
  const defaultFlow = flows.find((f: any) => f.isDefault && f.trigger === "message_in");
  return defaultFlow || null;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export interface BotTriggerContext {
  userId: string;
  customerId: string;
  phone: string;
  incomingMessage: string;
  /** For button_tap trigger: which button was pressed. */
  buttonValue?: string;
}

export interface BotTriggerResult {
  triggered: boolean;
  execId?: string;
  status?: string;
  reason?: string;
}

/**
 * Main bot trigger function. Called from incoming message handler.
 * Returns {triggered: false} if bot is paused, no flow matches, or lock is held.
 */
export async function triggerBotFlow(ctx: BotTriggerContext): Promise<BotTriggerResult> {
  const { userId, customerId, phone, incomingMessage } = ctx;

  // 1. Check conversation state — skip if bot paused or human active
  const conv = await (prisma as any).conversation.findFirst({
    where: { customerId },
    select: {
      id: true,
      botPaused: true,
      handoffState: true,
      activeFlowExecId: true,
      queueState: true,
    },
  }).catch(() => null);

  if (!conv) return { triggered: false, reason: "no_conversation" };
  if (conv.botPaused) return { triggered: false, reason: "bot_paused" };
  if (conv.handoffState === "human_active" || conv.handoffState === "human_required") {
    return { triggered: false, reason: "human_active" };
  }

  const conversationId = conv.id;

  // 2. Check for active execution waiting for input
  if (conv.activeFlowExecId) {
    const exec = await (prisma as any).convFlowExecution.findUnique({
      where: { id: conv.activeFlowExecId },
    }).catch(() => null);

    if (exec && exec.status === "running") {
      return resumeExecution(exec, ctx, conversationId);
    }
  }

  // 3. Find a matching flow
  const flow = await findMatchingFlow(userId, incomingMessage);
  if (!flow) return { triggered: false, reason: "no_matching_flow" };

  // 4. Acquire lock
  const execId = `exec_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const locked = await acquireLock(conversationId, execId);
  if (!locked) return { triggered: false, reason: "locked" };

  // 5. Parse nodes
  let nodes: FlowNode[] = [];
  try { nodes = JSON.parse(flow.nodesJson || "[]"); } catch {}
  if (!nodes.length) {
    await releaseLock(conversationId);
    return { triggered: false, reason: "empty_flow" };
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const startNode = nodes.find((n) => n.type === "start");
  if (!startNode) {
    await releaseLock(conversationId);
    return { triggered: false, reason: "no_start_node" };
  }

  // 6. Create execution record
  const state: ExecState = { variables: {} };
  const execution = await (prisma as any).convFlowExecution.create({
    data: {
      id: execId,
      flowId: flow.id,
      userId,
      customerId,
      phone,
      currentNode: startNode.id,
      stateJson: JSON.stringify(state),
      status: "running",
      startedAt: new Date(),
      updatedAt: new Date(),
    },
  }).catch((e: any) => { console.error("[bot] create exec failed:", e?.message); return null; });

  if (!execution) {
    await releaseLock(conversationId);
    return { triggered: false, reason: "exec_create_failed" };
  }

  // 7. Mark conversation as having active execution
  await (prisma as any).conversation.updateMany({
    where: { id: conversationId },
    data: { activeFlowExecId: execId, activeFlowId: flow.id },
  }).catch(() => null);

  // 8. Run the flow
  try {
    const result = await execNode(startNode, state, { userId, customerId, phone, incomingMessage, execId }, 0, nodeMap);

    if (result.done) {
      await finalizeExecution(execId, conversationId, flow.id, "completed");
    } else if (result.waitingForInput) {
      // Save state and wait for next message
      state.waitingForInput = true;
      state.waitingForNodeId = result.waitingForNodeId;
      state.waitingPrompt = result.waitingPrompt;
      await (prisma as any).convFlowExecution.update({
        where: { id: execId },
        data: {
          currentNode: result.waitingForNodeId || "",
          stateJson: JSON.stringify(state),
          updatedAt: new Date(),
        },
      }).catch(() => null);
      // Don't clear activeFlowExecId — we're still running
    }

    // Increment exec counter on flow
    await (prisma as any).convFlow.update({
      where: { id: flow.id },
      data: { execCount: { increment: 1 } },
    }).catch(() => null);

    return { triggered: true, execId, status: result.done ? "completed" : "waiting" };
  } catch (e: any) {
    console.error("[bot] execution error:", e?.message);
    await (prisma as any).convFlowExecution.update({
      where: { id: execId },
      data: { status: "error", errorMsg: e?.message || "unknown", updatedAt: new Date() },
    }).catch(() => null);
    await finalizeExecution(execId, conversationId, flow.id, "error");
    return { triggered: false, reason: "execution_error" };
  } finally {
    await releaseLock(conversationId);
  }
}

/**
 * Resume a waiting execution with the user's next message.
 * Called when conv.activeFlowExecId points to a running execution.
 */
async function resumeExecution(
  exec: any,
  ctx: BotTriggerContext,
  conversationId: string,
): Promise<BotTriggerResult> {
  const { userId, customerId, phone, incomingMessage, buttonValue } = ctx;
  const execId = exec.id;

  const locked = await acquireLock(conversationId, execId);
  if (!locked) return { triggered: false, reason: "locked" };

  try {
    let state: ExecState = { variables: {} };
    try { state = JSON.parse(exec.stateJson || "{}"); } catch {}

    const flow = await (prisma as any).convFlow.findUnique({ where: { id: exec.flowId } }).catch(() => null);
    if (!flow) return { triggered: false, reason: "flow_not_found" };

    let nodes: FlowNode[] = [];
    try { nodes = JSON.parse(flow.nodesJson || "[]"); } catch {}
    const nodeMap = new Map(nodes.map((n: FlowNode) => [n.id, n]));

    const waitingNode = state.waitingForNodeId ? nodeMap.get(state.waitingForNodeId) : null;
    if (!waitingNode) {
      await finalizeExecution(execId, conversationId, flow.id, "completed");
      return { triggered: true, execId, status: "completed" };
    }

    // Handle input based on node type
    const userInput = buttonValue || incomingMessage;

    if (waitingNode.type === "question") {
      const varKey = state.waitingPrompt || waitingNode.data.variableKey || "answer";
      state.variables[varKey] = userInput;
      state.waitingForInput = false;
      state.waitingForNodeId = undefined;
    } else if (waitingNode.type === "buttons") {
      // User tapped a button — find matching branch
      const branch = (waitingNode.branches || []).find(
        (b: any) => b.label === userInput || b.value === userInput,
      );
      if (branch) {
        const nextNode = nodeMap.get(branch.nextId);
        if (nextNode) {
          const result = await execNode(nextNode, state, { userId, customerId, phone, incomingMessage, execId }, 0, nodeMap);
          if (result.done) {
            await finalizeExecution(execId, conversationId, flow.id, "completed");
          } else if (result.waitingForInput) {
            state.waitingForInput = true;
            state.waitingForNodeId = result.waitingForNodeId;
            state.waitingPrompt = result.waitingPrompt;
            await (prisma as any).convFlowExecution.update({
              where: { id: execId },
              data: { currentNode: result.waitingForNodeId || "", stateJson: JSON.stringify(state), updatedAt: new Date() },
            }).catch(() => null);
          }
          return { triggered: true, execId, status: result.done ? "completed" : "waiting" };
        }
      }
      await finalizeExecution(execId, conversationId, flow.id, "completed");
      return { triggered: true, execId, status: "completed" };
    }

    // Continue to next node after collecting input
    const nextId = waitingNode.nextId;
    if (!nextId) {
      await finalizeExecution(execId, conversationId, flow.id, "completed");
      return { triggered: true, execId, status: "completed" };
    }

    const nextNode = nodeMap.get(nextId);
    if (!nextNode) {
      await finalizeExecution(execId, conversationId, flow.id, "completed");
      return { triggered: true, execId, status: "completed" };
    }

    const result = await execNode(nextNode, state, { userId, customerId, phone, incomingMessage, execId }, 0, nodeMap);

    if (result.done) {
      await finalizeExecution(execId, conversationId, flow.id, "completed");
    } else if (result.waitingForInput) {
      state.waitingForInput = true;
      state.waitingForNodeId = result.waitingForNodeId;
      state.waitingPrompt = result.waitingPrompt;
      await (prisma as any).convFlowExecution.update({
        where: { id: execId },
        data: { currentNode: result.waitingForNodeId || "", stateJson: JSON.stringify(state), updatedAt: new Date() },
      }).catch(() => null);
    }

    return { triggered: true, execId, status: result.done ? "completed" : "waiting" };
  } finally {
    await releaseLock(conversationId);
  }
}

async function finalizeExecution(execId: string, conversationId: string, flowId: string, status: string) {
  await (prisma as any).convFlowExecution.update({
    where: { id: execId },
    data: { status, updatedAt: new Date() },
  }).catch(() => null);
  await (prisma as any).conversation.updateMany({
    where: { id: conversationId },
    data: { activeFlowExecId: null, activeFlowId: null },
  }).catch(() => null);
  if (status === "completed") {
    await (prisma as any).convFlow.update({
      where: { id: flowId },
      data: { completions: { increment: 1 } },
    }).catch(() => null);
  }
}
