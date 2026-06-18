/**
 * POST /api/brain/lead-score — brain-computed lead score (Phase 6).
 * Scores from message text + (optional) customer order context. RBAC: smart_assistant.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiGate } from "@/lib/membership/gate";
import { classifyMessage, computeLeadScore } from "@/lib/brain";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await apiGate("smart_assistant");
  if (gate.response) return gate.response;
  const uid = gate.uid!;

  let body: any = {};
  try { body = await req.json(); } catch {}
  const text = String(body.message || body.input || "").slice(0, 4000);
  const customerId = body.customerId ? String(body.customerId) : null;

  let baseScore = 30;
  let orderCount = 0;
  let ctx: { orderCount?: number; totalOrderValue?: number; vip?: boolean } = {};
  let storedScore: number | null = null;
  if (customerId) {
    const c = await prisma.customer.findFirst({ where: { id: customerId, userId: uid } });
    if (c) {
      baseScore = Number((c as any).leadScore ?? 30);
      orderCount = Number((c as any).orderCount ?? 0);
      ctx = { orderCount, totalOrderValue: Number((c as any).totalOrderValue ?? 0), vip: Boolean((c as any).vip) };
    }
    const bp = await prisma.brainProfile.findFirst({ where: { customerId, userId: uid }, select: { leadScore: true } });
    storedScore = bp?.leadScore ?? null;
  }
  const insights = classifyMessage(text, ctx);
  const leadScore = computeLeadScore({ baseScore, insights, orderCount });

  return NextResponse.json({ ok: true, leadScore, storedScore, signals: insights.map((i) => i.type) });
}
