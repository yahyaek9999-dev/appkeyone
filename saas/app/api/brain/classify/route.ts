/**
 * POST /api/brain/classify — sales-intelligence classification (Phase 3).
 * Returns the typed classifications for a message; optionally persists them.
 * RBAC: smart_assistant. Brain-credit enforced + usage tracked.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiGate } from "@/lib/membership/gate";
import { classifyMessage, detectDialect, detectIndustry } from "@/lib/brain";
import { brainAllowsCall, debitBrainCall, trackBrainUsage } from "@/lib/brain/usage";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await apiGate("smart_assistant");
  if (gate.response) return gate.response;
  const uid = gate.uid!;

  const allow = await brainAllowsCall(uid);
  if (!allow.allowed) return NextResponse.json({ error: "insufficient_brain_credits", balance: allow.balance }, { status: 402 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const text = String(body.message || body.input || "").slice(0, 4000);
  const customerId = body.customerId ? String(body.customerId) : null;
  if (!text) return NextResponse.json({ error: "message_required" }, { status: 400 });

  const started = Date.now();
  let ctx: { orderCount?: number; totalOrderValue?: number; vip?: boolean } = {};
  if (customerId) {
    const c = await prisma.customer.findFirst({ where: { id: customerId, userId: uid } });
    if (c) ctx = { orderCount: Number((c as any).orderCount ?? 0), totalOrderValue: Number((c as any).totalOrderValue ?? 0), vip: Boolean((c as any).vip) };
  }
  const insights = classifyMessage(text, ctx);
  const dl = detectDialect(text);
  const ind = detectIndustry(dl.normalized);

  if (body.store === true && customerId) {
    for (const i of insights) {
      await prisma.brainInsight.create({ data: { userId: uid, customerId, type: i.type, label: i.label, score: i.score, evidence: i.evidence.slice(0, 300), source: "heuristic" } }).catch(() => {});
    }
  }

  const creditsUsed = await debitBrainCall(uid, "classify", `classify:${started}`);
  await trackBrainUsage({ userId: uid, customerId, channel: "classify", input: text, insights: insights.map((i) => i.type), dialect: dl.dialect, industry: String(ind.industry), creditsUsed, latencyMs: Date.now() - started });

  return NextResponse.json({ ok: true, insights, dialect: dl.dialect, dialectConfidence: dl.confidence, industry: ind.industry, stored: body.store === true && !!customerId, creditsUsed });
}
