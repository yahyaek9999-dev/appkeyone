/**
 * POST /api/brain/chat — run the full Brain pipeline (Phase 6 + 9).
 * RBAC: smart_assistant capability. Brain-credit enforced + usage tracked.
 */
import { NextResponse } from "next/server";
import { apiGate } from "@/lib/membership/gate";
import { runBrainPipeline } from "@/lib/brain/router";
import { brainAllowsCall, debitBrainCall, trackBrainUsage } from "@/lib/brain/usage";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await apiGate("smart_assistant");
  if (gate.response) return gate.response;
  const uid = gate.uid!;

  const allow = await brainAllowsCall(uid);
  if (!allow.allowed) {
    return NextResponse.json({ error: "insufficient_brain_credits", balance: allow.balance }, { status: 402 });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const input = String(body.message || body.input || "").slice(0, 4000);
  const customerId = body.customerId ? String(body.customerId) : null;
  if (!input) return NextResponse.json({ error: "message_required" }, { status: 400 });

  const started = Date.now();
  const out = await runBrainPipeline(uid, customerId, input);
  const creditsUsed = await debitBrainCall(uid, "chat", `chat:${started}`);
  await trackBrainUsage({
    userId: uid, customerId, channel: "chat", input, output: out.response,
    dialect: out.dialect, industry: out.industry, insights: out.insights,
    provider: out.provider, model: out.model, creditsUsed, latencyMs: Date.now() - started,
  });

  return NextResponse.json({
    ok: true, response: out.response, provider: out.provider, usedLLM: out.usedLLM,
    dialect: out.dialect, industry: out.industry, insights: out.insights, kbUsed: out.kbUsed,
    creditsUsed,
  });
}
