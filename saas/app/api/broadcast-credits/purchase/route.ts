/**
 * Broadcast-credit purchase requests (customer side). No payment processor is
 * wired, so a request is reviewed and granted by an admin (mirrors the wallet
 * top-up flow).
 *   GET  /api/broadcast-credits/purchase — list own requests
 *   POST /api/broadcast-credits/purchase — create one { credits, amountUsd?, method?, note? }
 * Owner-only via the "broadcasts" permission + capability gate. Pending requests
 * are capped to 5 to prevent spam.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiGate } from "@/lib/membership/gate";
import { getAuthContext } from "@/lib/auth";
import { auditCtx } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

const METHODS = new Set(["manual", "instapay", "vodafone_cash", "bank", "card"]);
const MAX_PENDING = 5;
const MAX_CREDITS = 1_000_000;

export async function GET() {
  const g = await apiGate("broadcasts", "broadcasts");
  if (g.response) return g.response;
  const uid = g.uid!;

  const items = await prisma.broadcastCreditPurchaseRequest
    .findMany({ where: { userId: uid }, orderBy: { createdAt: "desc" }, take: 50 })
    .catch(() => []);
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  const g = await apiGate("broadcasts", "broadcasts");
  if (g.response) return g.response;
  const uid = g.uid!;

  let body: any = {};
  try { body = await req.json(); } catch {}

  const credits = Math.round(Number(body.credits) || 0);
  if (!Number.isFinite(credits) || credits <= 0) {
    return NextResponse.json({ error: "invalid_credits" }, { status: 400 });
  }
  if (credits > MAX_CREDITS) {
    return NextResponse.json({ error: "credits_too_large" }, { status: 400 });
  }
  const amountUsd = Math.max(0, Number(body.amountUsd) || 0);
  const method = METHODS.has(String(body.method)) ? String(body.method) : "manual";

  // Anti-spam: cap concurrent pending requests.
  const pending = await prisma.broadcastCreditPurchaseRequest
    .count({ where: { userId: uid, status: "pending" } })
    .catch(() => 0);
  if (pending >= MAX_PENDING) {
    return NextResponse.json(
      { error: "too_many_pending", detail: `لديك ${pending} طلبات قيد المراجعة بالفعل.` },
      { status: 429 },
    );
  }

  try {
    const created = await prisma.broadcastCreditPurchaseRequest.create({
      data: {
        userId: uid,
        credits,
        amountUsd,
        method,
        paymentRef: body.paymentRef ? String(body.paymentRef).slice(0, 120) : null,
        note: body.note ? String(body.note).slice(0, 500) : null,
      },
    });
    void auditCtx(await getAuthContext(), "broadcast_credit.purchase_requested", {
      userId: uid,
      targetType: "broadcast_credit_purchase",
      targetId: created.id,
      metadata: { credits, amountUsd, method },
      req,
    });
    return NextResponse.json({ ok: true, request: created });
  } catch (e: any) {
    return NextResponse.json({ error: "create_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
