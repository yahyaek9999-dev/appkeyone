// lib/bridge/transport-router.ts — KEYONE Bridge outbound router (Phase 2).
//
// The single place that decides whether an outbound WhatsApp message should be
// delivered through a customer-hosted Bridge instead of the co-located
// whatsapp-web.js gateway. It is called ONLY from the `wa.sendNow` choke point
// (lib/wa.ts) and ONLY when the master flag `BRIDGE_ENABLED` is on, so with the
// flag off this module is never even imported — the send pipeline is unchanged.
//
// Design (locked spec §6): the Cloud never holds the live WebSocket to a Bridge;
// the co-located `bridge-gateway` process does. So "route via bridge" means:
// POST the message to the gateway's internal endpoint, which pushes it over the
// live socket to the customer's Bridge and waits for the transport ack.
//
// SAFETY: this returns `null` for anything that is NOT a bridge-mode bot, which
// tells the caller to fall through to its normal transport. It never throws to
// the caller for a routing decision — a thrown/failed bridge send surfaces as a
// normal { ok:false } result, identical in shape to a gateway failure.

import { prisma } from "@/lib/db";
import { normalizeConnectionMode } from "@/lib/messaging/mode";
import { bridgeEnabled, BRIDGE_GATEWAY_INTERNAL_URL } from "./flags";

const SECRET = process.env.SAAS_INTERNAL_SECRET || "";

/** wa.call-shaped result so the caller can treat bridge + gateway identically. */
export type SendResult = { ok: boolean; status: number; data: any };

/**
 * Decide + perform bridge routing for one outbound text.
 *
 * @returns
 *   - `null`  → not a bridge send; caller must fall through to its default
 *               transport (whatsapp-web.js gateway). This is the common case.
 *   - result  → the bridge attempt's outcome (ok/failed), wa.call-shaped.
 */
export async function maybeRouteBridgeSend(
  userId: string,
  to: string,
  text: string,
): Promise<SendResult | null> {
  // Defense in depth — the caller already gates on this, but never route when off.
  if (!bridgeEnabled()) return null;

  // Is THIS tenant's bot on the bridge transport? One tiny indexed lookup.
  let mode: string | null | undefined;
  try {
    const bot = await prisma.bot.findUnique({
      where: { userId },
      select: { connectionMode: true },
    });
    mode = bot?.connectionMode;
  } catch {
    // If we cannot even read the bot, don't hijack the send — fall through.
    return null;
  }
  if (normalizeConnectionMode(mode) !== "bridge") return null;

  // From here on this IS a bridge send; any failure returns { ok:false } (we do
  // NOT silently fall back to the whatsapp-web.js gateway, which is not linked
  // for a bridge tenant and would just fail differently / confusingly).
  return sendViaGateway({ userId, to, text });
}

/** POST one outbound message to the co-located gateway's internal endpoint. */
async function sendViaGateway(msg: {
  userId: string;
  to: string;
  text: string;
}): Promise<SendResult> {
  if (!SECRET) {
    return { ok: false, status: 500, data: { error: "internal_secret_unset" } };
  }
  const url = `${BRIDGE_GATEWAY_INTERNAL_URL.replace(/\/$/, "")}/internal/outbound`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": SECRET,
      },
      body: JSON.stringify({
        userId: msg.userId,
        provider: "whatsapp",
        to: msg.to,
        text: msg.text,
      }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e: any) {
    return { ok: false, status: 0, data: { error: e?.message || "gateway_unreachable" } };
  }
}
