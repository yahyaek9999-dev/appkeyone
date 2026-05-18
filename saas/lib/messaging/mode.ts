/**
 * Connection-mode normalizer for the hybrid WhatsApp architecture.
 *
 * The database stores `Bot.connectionMode` as a free string for forward
 * compatibility, but we want exactly two runtime modes:
 *   - "qr"          → whatsapp-web.js gateway (legacy)
 *   - "meta_cloud"  → Meta Cloud API (new)
 *
 * To keep production safe we accept legacy values too. Anything we don't
 * recognise falls back to "qr" — never to Meta, which is the riskier path.
 */

export type ConnectionMode = "qr" | "meta_cloud";

const LEGACY_MAP: Record<string, ConnectionMode> = {
  qr: "qr",
  unofficial: "qr",
  whatsappweb: "qr",
  "whatsapp-web": "qr",
  meta_cloud: "meta_cloud",
  meta: "meta_cloud",
  cloud: "meta_cloud",
  official: "meta_cloud",
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
