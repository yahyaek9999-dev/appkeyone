/**
 * Admin per-tenant wallet operations.
 *   GET  /api/admin/wallet/:userId — wallet summary + ledger + meta breakdown
 *   POST /api/admin/wallet/:userId — { action, amountUsd?, reason?, ... }
 *        actions: credit | debit | adjust | reverse | set_status | set_threshold
 * Admin-only. Every money action writes an AuditLog row.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";
import { parseUsdAmount, roundUsd } from "@/lib/wallet/money";
import {
  getWalletSummary, listLedger, credit, debit, adjust, reverse,
  setWalletStatus, setLowBalanceThreshold,
} from "@/lib/wallet/wallet";
import { getTenantMetaBreakdown } from "@/lib/wallet/analytics";
import { billUnbilledForUser } from "@/lib/wallet/meta-cost";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { userId: string } }) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const userId = params.userId;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const [wallet, ledger, meta] = await Promise.all([
      getWalletSummary(userId),
      listLedger(userId, { take: 50 }),
      getTenantMetaBreakdown(userId, { days: 30 }),
    ]);
    return NextResponse.json({ ok: true, user, wallet, ledger: ledger.items, nextCursor: ledger.nextCursor, meta });
  } catch (e: any) {
    return NextResponse.json({ error: "wallet_unavailable", detail: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const userId = params.userId;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = String(body.action || "");
  const adminEmail = admin?.email || "admin";
  const adminId = admin?.id || null;
  const reason = body.reason ? String(body.reason).slice(0, 300) : "";
  // Idempotency: prefer a client-supplied key (one UUID per admin click, resent
  // on retry); otherwise collapse identical requests within a 30s window so a
  // network retry / double-click cannot double-credit or double-debit.
  const clientKey = String(body.idempotencyKey || "").slice(0, 120);
  const idemBase =
    clientKey ||
    `${adminId || "admin"}:${userId}:${roundUsd(Number(body.amountUsd) || 0)}:${reason}:${Math.floor(Date.now() / 30000)}`;

  try {
    if (action === "credit" || action === "debit") {
      const amountUsd = parseUsdAmount(body.amountUsd);
      if (amountUsd <= 0) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
      const fn = action === "credit" ? credit : debit;
      const res = await fn({
        userId, kind: action === "credit" ? "adjustment" : "adjustment", amountUsd,
        source: "admin", reason: reason || `admin_${action}`,
        idempotencyKey: `admin:${action}:${idemBase}`, actorId: adminId, actorEmail: adminEmail,
      });
      await audit({ userId, action: action === "credit" ? "wallet.admin_credit" : "wallet.admin_debit", actorId: adminId, actorEmail: adminEmail, actorRole: "admin", targetType: "wallet", targetId: userId, metadata: { amountUsd, reason, result: res.reason || "ok" }, req });
      if (!res.ok && res.reason === "insufficient_funds") return NextResponse.json({ ok: false, error: "insufficient_funds", shortfall: res.shortfall, balanceAfter: res.balanceAfter }, { status: 409 });
      return NextResponse.json({ ok: res.ok, result: res });
    }

    if (action === "adjust") {
      const signed = roundUsd(Number(body.amountUsd) || 0);
      if (signed === 0) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
      const res = await adjust({ userId, amountUsd: signed, source: "admin", reason: reason || "admin_adjustment", idempotencyKey: `admin:adjust:${idemBase}`, actorId: adminId, actorEmail: adminEmail });
      await audit({ userId, action: "wallet.admin_adjusted", actorId: adminId, actorEmail: adminEmail, actorRole: "admin", targetType: "wallet", targetId: userId, metadata: { amountUsd: signed, reason }, req });
      if (!res.ok && res.reason === "insufficient_funds") return NextResponse.json({ ok: false, error: "insufficient_funds", shortfall: res.shortfall }, { status: 409 });
      return NextResponse.json({ ok: res.ok, result: res });
    }

    if (action === "reverse") {
      const ledgerId = String(body.ledgerId || "");
      if (!ledgerId) return NextResponse.json({ error: "missing_ledger_id" }, { status: 400 });
      // Confirm the ledger belongs to this tenant (no cross-tenant reversal).
      const led = await prisma.walletLedger.findUnique({ where: { id: ledgerId }, select: { userId: true } });
      if (!led || led.userId !== userId) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const res = await reverse({ ledgerId, reason: reason || "admin_reversal", actorId: adminId, actorEmail: adminEmail });
      await audit({ userId, action: "wallet.admin_reversed", actorId: adminId, actorEmail: adminEmail, actorRole: "admin", targetType: "wallet_ledger", targetId: ledgerId, metadata: { reason, result: res.reason || "ok" }, req });
      return NextResponse.json({ ok: res.ok, result: res });
    }

    if (action === "set_status") {
      const status = body.status === "suspended" ? "suspended" : "active";
      await setWalletStatus(userId, status);
      await audit({ userId, action: "wallet.status_changed", actorId: adminId, actorEmail: adminEmail, actorRole: "admin", targetType: "wallet", targetId: userId, metadata: { status }, req });
      return NextResponse.json({ ok: true, status });
    }

    if (action === "set_threshold") {
      const threshold = roundUsd(Math.max(0, Number(body.thresholdUsd) || 0));
      await setLowBalanceThreshold(userId, threshold);
      await audit({ userId, action: "wallet.threshold_changed", actorId: adminId, actorEmail: adminEmail, actorRole: "admin", targetType: "wallet", targetId: userId, metadata: { threshold }, req });
      return NextResponse.json({ ok: true, thresholdUsd: threshold });
    }

    if (action === "retry_billing") {
      const res = await billUnbilledForUser(userId);
      await audit({ userId, action: "wallet.retry_billing", actorId: adminId, actorEmail: adminEmail, actorRole: "admin", targetType: "wallet", targetId: userId, metadata: res, req });
      return NextResponse.json({ ok: true, result: res });
    }

    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: "action_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
