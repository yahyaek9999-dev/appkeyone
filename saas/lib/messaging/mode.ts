/**
 * Connection-mode normalizer for the hybrid WhatsApp architecture.
 *
 * The database stores `Bot.connectionMode` as a free string for forward
 * compatibility, but we want exactly three runtime modes:
 *   - "qr"          → whatsapp-web.js gateway (legacy)
 *   - "meta_cloud"  → Meta Cloud API (new)
 *   - "bridge"      → KEYONE Bridge transport (customer-hosted connector, new)
 *
 * To keep production safe we accept legacy values too. Anything we don't
 * recognise falls back to "qr" — never to Meta or Bridge, which are the
 * riskier / gated paths.
 */

export type ConnectionMode = "qr" | "meta_cloud" | "bridge";

const LEGACY_MAP: Record<string, ConnectionMode> = {
  qr: "qr",
  unofficial: "qr",
  whatsappweb: "qr",
  "whatsapp-web": "qr",
  meta_cloud: "meta_cloud",
  meta: "meta_cloud",
  cloud: "meta_cloud",
  official: "meta_cloud",
  bridge: "bridge",
  keyone_bridge: "bridge",
  connector: "bridge",
};

/**
 * Normalize whatever the merchant has in `Bot.connectionMode` to one of the
 * two canonical runtime values. Unknown strings default to "qr".
 */
export function normalizeConnectionMode(raw: string | null | undefined): ConnectionMode {
  if (!raw) return "qr";
  const k = String(raw).trim().toLowerCase().replace(/\s+/g, "_");
  return LEGACY_MAP[k] ?? "qr";
}

/**
 * True when the bot is configured for Meta Cloud, IGNORING global flags or
 * tier limits. Useful for showing UI hints. Routing decisions must use
 * `metaCloudAllowedForUser` from feature-flags.ts.
 */
export function isMetaConfigured(bot: { connectionMode?: string | null; metaAccessTokenEnc?: string | null }): boolean {
  return normalizeConnectionMode(bot.connectionMode) === "meta_cloud"
    && !!(bot.metaAccessTokenEnc && bot.metaAccessTokenEnc.trim());
}

/**
 * True when the bot is configured for the KEYONE Bridge transport, IGNORING
 * global flags or tier limits. Useful for showing UI hints. Routing decisions
 * must additionally check `bridgeEnabled()` from lib/bridge/flags.ts — Bridge
 * is a NEW, flag-gated path and MUST NOT route unless the master switch is on.
 */
export function isBridgeMode(bot: { connectionMode?: string | null }): boolean {
  return normalizeConnectionMode(bot.connectionMode) === "bridge";
}
