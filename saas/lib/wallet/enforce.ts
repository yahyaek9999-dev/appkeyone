/**
 * lib/wallet/enforce.ts — additive PRE-SEND balance enforcement (the boundary).
 *
 * The brief asks: "Before send: verify wallet balance. If insufficient: block
 * send, create audit log, create notification. Existing conversations remain
 * visible. Only sending is blocked."
 *
 * This helper implements exactly that — at the *request boundary* (broadcast
 * create, inbox reply), NOT inside the protected WhatsApp send pipeline. The
 * pipeline files (lib/messaging/*, the broadcast drain cron) are never touched
 * and never import @/lib/wallet (asserted by scripts/verify/wallet.js).
 *
 * Gating: WALLET_ENFORCE_SENDS=1 (+ WALLET_BILLING_ENABLED=1). Default OFF →
 * walletAllowsSend() fails OPEN, so importing/calling this is byte-neutral to
 * every existing flow until an operator deliberately turns enforcement on.
 *
 * On a block we:
 *   1. write a SafetyAudit row (category "billing") — the in-dashboard
 *      notification the merchant sees under Protection/Safety logs, and
 *   2. best-effort push a WhatsApp alert to the merchant's notify number.
 * We NEVER throw: any internal error fails OPEN so sending is never broken by
 * the gate itself.
 */
import { prisma } from "@/lib/db";
import { walletAllowsSend } from "./wallet";
import { formatUsd } from "./money";
import { resolveNotifyPhone, notifyAdmin } from "@/lib/notify";

export type SendGateContext =
  | "broadcast"
  | "inbox_reply"
  | "follow_up"
  | "recovery"
  | "automation";

export interface SendGateResult {
  /** true → proceed with the send. false → caller must block (return 402). */
  allowed: boolean;
  /** machine reason when blocked: empty_balance | wallet_suspended | … */
  reason?: string;
  /** current wallet balance (USD) at decision time. */
  balance: number;
}

const CTX_AR: Record<SendGateContext, string> = {
  broadcast: "إرسال البث",
  inbox_reply: "إرسال الرد",
  follow_up: "إرسال المتابعة",
  recovery: "إرسال الاستعادة",
  automation: "الإرسال التلقائي",
};

const REASON_AR: Record<string, string> = {
  empty_balance: "رصيد المحفظة صفر",
  wallet_suspended: "المحفظة موقوفة",
  insufficient_balance: "رصيد غير كافٍ",
};

/**
 * Decide whether a send may proceed for `userId`. When enforcement is OFF this
 * always returns allowed=true (fail-open). When ON and the wallet is empty or
 * suspended, it records a billing SafetyAudit, optionally notifies the
 * merchant, and returns allowed=false so the caller can reject the request.
 */
export async function enforceWalletForSend(
  userId: string,
  ctx: SendGateContext,
  opts: { recipients?: number; notify?: boolean } = {}
): Promise<SendGateResult> {
  try {
    const gate = await walletAllowsSend(userId);
    if (gate.allowed) return { allowed: true, balance: gate.balance };

    const reason = gate.reason || "insufficient_balance";
    const ctxAr = CTX_AR[ctx] || "الإرسال";
    const reasonAr = REASON_AR[reason] || "رصيد غير كافٍ";

    // (1) In-dashboard notification — billing SafetyAudit row.
    await prisma.safetyAudit
      .create({
        data: {
          userId,
          level: reason === "wallet_suspended" ? "critical" : "warn",
          category: "billing",
          title: `تم إيقاف ${ctxAr} — ${reasonAr}`,
          detail:
            `الرصيد الحالي ${formatUsd(gate.balance)} غير كافٍ لإتمام ${ctxAr}. ` +
            `المحادثات الحالية تظل ظاهرة، لكن الإرسال متوقف حتى تشحن المحفظة.`,
          payload: JSON.stringify({
            reason,
            balance: gate.balance,
            context: ctx,
            recipients: opts.recipients ?? null,
          }),
        },
      })
      .catch(() => {});

    // (2) Best-effort WhatsApp alert to the merchant's notify number.
    if (opts.notify !== false) {
      void (async () => {
        try {
          const phone = await resolveNotifyPhone(userId);
          if (phone) {
            await notifyAdmin({
              userId,
              toPhone: phone,
              text:
                `⚠️ تم إيقاف ${ctxAr} — ${reasonAr}.\n` +
                `الرصيد الحالي: ${formatUsd(gate.balance)}.\n` +
                `اشحن محفظتك لاستئناف الإرسال. محادثاتك الحالية لم تتأثر.`,
              category: "billing",
            });
          }
        } catch {
          /* notification is best-effort */
        }
      })();
    }

    return { allowed: false, reason, balance: gate.balance };
  } catch {
    // Fail OPEN — the gate must never break sending on an internal error.
    return { allowed: true, balance: 0 };
  }
}

/** Arabic, merchant-facing message for a 402 response body. */
export function blockedSendMessage(reason: string | undefined, balance: number): string {
  const reasonAr = REASON_AR[reason || "insufficient_balance"] || "رصيد غير كافٍ";
  return `${reasonAr} — الرصيد الحالي ${formatUsd(balance)}. اشحن المحفظة لمتابعة الإرسال.`;
}
