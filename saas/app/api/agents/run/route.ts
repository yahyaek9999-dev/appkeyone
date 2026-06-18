/**
 * POST /api/agents/run — run the multi-agent orchestrator (Phase 2).
 * RBAC: smart_assistant. Records AgentExecution/AgentDecision; routes actions
 * through the Action Engine (proposes by default).
 */
import { NextResponse } from "next/server";
import { apiGate } from "@/lib/membership/gate";
import { runOrchestrator } from "@/lib/agents/orchestrator";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await apiGate("smart_assistant");
  if (gate.response) return gate.response;
  const uid = gate.uid!;
  let body: any = {};
  try { body = await req.json(); } catch {}
  const input = String(body.message || body.input || "").slice(0, 4000);
  const customerId = body.customerId ? String(body.customerId) : null;
  if (!input) return NextResponse.json({ error: "message_required" }, { status: 400 });
  const out = await runOrchestrator(uid, customerId, input, { execute: body.execute === true });
  return NextResponse.json({ ok: true, executionId: out.executionId, agentsRun: out.agentsRun, decisions: out.decisions, actions: out.actions });
}
