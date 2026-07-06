// lib/bridge/flags.ts — KEYONE Bridge feature flag (Cloud side).
//
// Bridge is a NEW, additive transport. NOTHING routes to a bridge and NO
// dashboard surface appears unless this flag is on. Default OFF, so existing
// tenants, Meta Cloud, and the legacy co-located QR gateway are completely
// unaffected until Bridge is explicitly enabled (locked requirement #9).

/** Master switch. Set BRIDGE_ENABLED=1 (or "true") in the Cloud env to activate. */
export const BRIDGE_ENABLED =
  process.env.BRIDGE_ENABLED === "1" || process.env.BRIDGE_ENABLED === "true";

export function bridgeEnabled(): boolean {
  return BRIDGE_ENABLED;
}

/** The Cloud WS ingress URL the Dashboard hands to a linking Bridge (Phase 2). */
export const BRIDGE_WS_URL = process.env.BRIDGE_WS_URL || "";

/**
 * Internal HTTP base for the co-located bridge-gateway process (Phase 2 outbound).
 * The Cloud (Next.js) posts outbound messages here; the gateway pushes them over
 * the live WebSocket to the customer's Bridge. Localhost by default — the gateway
 * and the Cloud run on the same box. Never exposed publicly (guarded by the
 * internal secret; Caddy only proxies the /bridge WS path, not /internal/*).
 */
export const BRIDGE_GATEWAY_INTERNAL_URL =
  process.env.BRIDGE_GATEWAY_INTERNAL_URL || "http://127.0.0.1:3002";

/**
 * A Bridge is considered stale/offline if no heartbeat has been seen for this
 * long. The gateway flips status→offline on socket close immediately; this
 * threshold covers crash-without-close (no FIN) cases via the staleness sweep.
 */
export const BRIDGE_HEARTBEAT_TIMEOUT_MS = Number(
  process.env.BRIDGE_HEARTBEAT_TIMEOUT_MS || 90_000,
);
