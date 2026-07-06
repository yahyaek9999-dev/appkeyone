// lib/bridge/gateway.ts — Cloud → co-located bridge-gateway internal calls.
//
// The Cloud never holds the live WebSocket to a Bridge; the gateway does. To
// control a Bridge from the Dashboard (Start QR / Reconnect / Restart / Update)
// the Cloud POSTs the command here and the gateway pushes a `control` frame over
// the live socket. Localhost + x-internal-secret only.

import { BRIDGE_GATEWAY_INTERNAL_URL } from "./flags";

const SECRET = process.env.SAAS_INTERNAL_SECRET || "";

export type ControlAction = "start_qr" | "reconnect" | "restart" | "update" | "disconnect";

export type GatewayResult = { ok: boolean; status: number; data: any };

/** Push a control command to a user's (primary) Bridge via the gateway. */
export async function pushControl(
  userId: string,
  action: ControlAction,
  opts?: { bridgeId?: string; provider?: string },
): Promise<GatewayResult> {
  if (!SECRET) return { ok: false, status: 500, data: { error: "internal_secret_unset" } };
  const url = `${BRIDGE_GATEWAY_INTERNAL_URL.replace(/\/$/, "")}/internal/control`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": SECRET },
      body: JSON.stringify({
        userId,
        action,
        bridgeId: opts?.bridgeId,
        provider: opts?.provider || "whatsapp",
      }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e: any) {
    return { ok: false, status: 0, data: { error: e?.message || "gateway_unreachable" } };
  }
}
