/**
 * POST /api/brain/memory — enrich + return a customer's Brain memory (Phase 2).
 * RBAC: smart_assistant. Brain-credit enforced + usage tracked.
 */
import { NextResponse } from "next/server";
import { apiGate } from "@/lib/membership/gate";
import { enrichBrainMemory, getCustomerBrainProfile } from "@/lib/brain";
import { brainAllowsCall, debitBrainCall, trackBrainUsage } from "@/lib/brain/usage";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await apiGate("smart_assistant");
  if (gate.response) return gate.response;
  const uid = gate.uid!;

  let body: any = {};
  try { body = await req.json(); } catch {}
  const customerId = body.customerId ? String(body.customerId) : null;
  if (!customerId) return NextResponse.json({ error: "customerId_required" }, { status: 400 });

  // Read-only fetch does not consume credits; an enrich pass does.
  if (body.read === true) {
    const data = await getCustomerBrainProfile(uid, customerId);
    return NextResponse.json({ ok: true, ...data });
  }

  const allow = await brainAllowsCall(uid);
  if (!allow.allowed) return NextResponse.json({ error: "insufficient_brain_credits", balance: allow.balance }, { status: 402 });

  const started = Date.now();
  const enriched = await enrichBrainMemory(uid, customerId, String(body.message || ""));
  const creditsUsed = await debitBrainCall(uid, "memory", `memory:${started}`);
  await trackBrainUsage({ userId: uid, customerId, channel: "memory", insights: enriched.insights.map((i) => i.type), dialect: enriched.dialect, industry: enriched.industry, creditsUsed, latencyMs: Date.now() - started });

  return NextResponse.json({ ok: true, profile: enriched.profile, memory: enriched.memory, insights: enriched.insights, dialect: enriched.dialect, industry: enriched.industry, kbUsed: enriched.kbCount, creditsUsed });
}
