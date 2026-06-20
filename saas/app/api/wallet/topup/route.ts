/**
 * Wallet top-up requests (customer side). No payment processor is wired, so a
 * request is reviewed and credited by an admin (mirrors UpgradeRequest).
 *   GET  /api/wallet/topup  — list own requests
 *   POST /api/wallet/topup  — create a request { amountUsd, method?, note?, contactPhone?, paymentRef? }
 * Owner-only (financial): gated by the "billing" permission. Because "billing"
 * is owner-only in the RBAC matrix, the permitted principal is always the owner.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserForPermission } from "@/lib/auth";
import { audit } from "@/lib/audit/log";
import { parseUsdAmount } from "@/lib/wallet/money";

export const dynamic = "force-dynamic";

const METHODS = new Set(["manual", "instapay", "vodafone_cash", "bank", "card"]);
const MAX_PENDING = 5;
const MAX_TOPUP_USD = 100_000;

export async function GET() {
  const user = await getUserForPermission("billing");
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const items = await prisma.walletTopupRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  }).catch(() => []);
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  const user = await getUserForPermission("billing");
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const amountUsd = parseUsdAmount(body.amountUsd);
  if (amountUsd <= 0) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  if (amountUsd > MAX_TOPUP_USD) return NextResponse.json({ error: "amount_too_large" }, { status: 400 });
  // Accept any CONFIGURED payment-method key (binance/usdt_trc20/bank_transfer/…)
  // so the request records the real method finance needs — not a "manual" fallback.
  const rawMethod = String(body.method || "");
  const isConfigured = rawMethod
    ? await prisma.paymentMethod.findUnique({ where: { key: rawMethod }, select: { key: true } }).then((m) => !!m).catch(() => false)
    : false;
  const method = isConfigured || METHODS.has(rawMethod) ? rawMethod : "manual";

  // Anti-spam: cap concurrent pending requests.
  const pending = await prisma.walletTopupRequest.count({ where: { userId: user.id, status: "pending" } }).catch(() => 0);
  if (pending >= MAX_PENDING) {
    return NextResponse.json({ error: "too_many_pending", detail: `لديك ${pending} طلبات قيد المراجعة بالفعل.` }, { status: 429 });
  }

  try {
    const created = await prisma.walletTopupRequest.create({
      data: {
        userId: user.id,
        amountUsd,
        method,
        note: body.note ? String(body.note).slice(0, 500) : null,
        contactPhone: body.contactPhone ? String(body.contactPhone).slice(0, 40) : null,
        paymentRef: body.paymentRef ? String(body.paymentRef).slice(0, 120) : null,
      },
    });
    void audit({
      userId: user.id, action: "wallet.topup_requested", actorId: user.id, actorEmail: user.email, actorRole: "owner",
      targetType: "wallet_topup", targetId: created.id, metadata: { amountUsd, method }, req,
    });
    return NextResponse.json({ ok: true, request: created });
  } catch (e: any) {
    return NextResponse.json({ error: "create_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
