/**
 * POST /api/brain/action — execute (or propose) a Brain action (Phase 3).
 * RBAC: smart_assistant. Logs ActionExecution + ActionAudit. Real mutation only
 * when ACTION_ENGINE_EXECUTE=1 and body.execute=true; otherwise PROPOSED.
 */
import { NextResponse } from "next/server";
import { apiGate } from "@/lib/membership/gate";
import { executeAction, ACTION_TYPES, type ActionType } from "@/lib/actions/engine";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await apiGate("smart_assistant");
  if (gate.response) return gate.response;
  const uid = gate.uid!;
  let body: any = {};
  try { body = await req.json(); } catch {}
  const actionType = String(body.actionType || "");
  if (!(ACTION_TYPES as readonly string[]).includes(actionType)) {
    return NextResponse.json({ error: "invalid_action", allowed: ACTION_TYPES }, { status: 400 });
  }
  const out = await executeAction({
    userId: uid, customerId: body.customerId ? String(body.customerId) : null,
    actionType: actionType as ActionType, params: body.params || {}, source: "api", execute: body.execute === true,
  });
  return NextResponse.json({ ok: out.status !== "failed", ...out });
}
