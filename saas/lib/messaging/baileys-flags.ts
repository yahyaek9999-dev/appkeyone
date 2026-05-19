/**
 * Baileys experimental provider guardrails.
 *
 * This file intentionally does NOT route production traffic. It only exposes
 * feature-flag helpers and runtime labels for the future isolated Baileys
 * worker. The current QR / Meta provider selection remains unchanged in
 * `lib/messaging/index.ts`.
 */

export const BAILEYS_PROVIDER_NAME = "baileys" as const;

/**
 * Global kill switch. Default is disabled, and only the exact value "1"
 * should be treated as enabled.
 */
export function baileysGloballyEnabled(): boolean {
  return process.env.ENABLE_BAILEYS === "1";
}

/**
 * Human-readable routing guard used by verification and future admin UI.
 */
export function baileysReadiness() {
  return {
    enabled: baileysGloballyEnabled(),
    flag: process.env.ENABLE_BAILEYS ?? "0",
    provider: BAILEYS_PROVIDER_NAME,
    routingActive: false,
    reason: baileysGloballyEnabled()
      ? "flag_enabled_but_router_not_wired"
      : "global_disabled",
  };
}
