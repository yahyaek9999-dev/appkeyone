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
