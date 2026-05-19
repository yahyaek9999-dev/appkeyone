/**
 * MessagingProvider — common interface across QR and Meta Cloud API.
 *
 * Business logic (broadcasts, daily-report, shipment-notify, anger alerts,
 * inbox-send, etc.) should depend ONLY on this interface, never on the
 * underlying transport. This lets us:
 *   - swap providers per-bot at runtime
 *   - add new providers (e.g. Twilio) later without touching call sites
 *   - centralize delivery-state tracking in WaMessage
 *
 * Phase 1 ships:
 *   - The interface
 *   - QRProvider (thin wrapper over the existing wa.ts micro-service)
 *   - MetaCloudProvider (stub — every method returns NOT_IMPLEMENTED)
 *
 * Phase 2 fills in the Meta provider.
 * Phase 3 will add an experimental Baileys provider behind ENABLE_BAILEYS=1.
 */

/** Universal response shape for every provider method. */
export interface ProviderResult<T = unknown> {
  ok: boolean;
  /** Provider-native message id when ok=true (e.g. Meta wamid or QR msg id). */
  providerMsgId?: string;
  /** Stable, machine-readable error code. */
  errorCode?: string;
  /** Human-readable error for logs / merchant. */
  errorDetail?: string;
  /** Provider-specific raw payload — handy for debugging, never shown to merchant. */
  data?: T;
}

export interface SendTextArgs {
  userId: string; // merchant id
  to: string; // E.164 destination phone (with or without "+")
  text: string;
  /** Optional caller-supplied idempotency key (string up to 64 chars). */
  idempotencyKey?: string;
  /** Conversation context if known — recorded in WaMessage for analytics. */
  conversationId?: string;
}

export interface SendMediaArgs extends SendTextArgs {
  mediaUrl: string;
  mediaType: "image" | "video" | "audio" | "document";
  caption?: string;
}

export interface SendTemplateArgs {
  userId: string;
  to: string;
  templateName: string;
  language?: string; // BCP-47, default "ar"
  components?: Array<Record<string, unknown>>; // Meta-style template variables
  idempotencyKey?: string;
}

export interface ProviderStatus {
  /** "connected" | "connecting" | "disconnected" | "not_configured" | "unknown". */
  state: string;
  /** Optional health rating (Meta only): GREEN | YELLOW | RED. */
  qualityRating?: string;
  /** Optional messaging tier (Meta only). */
  messagingLimit?: string;
  detail?: string;
}

/** What every provider must implement. */
export interface MessagingProvider {
  readonly name: "qr" | "meta_cloud" | "baileys";

  sendMessage(args: SendTextArgs): Promise<ProviderResult>;
  sendMedia(args: SendMediaArgs): Promise<ProviderResult>;
  /** Template messages — Meta only. QR returns NOT_SUPPORTED. */
  sendTemplate(args: SendTemplateArgs): Promise<ProviderResult>;

  /** Mark an inbound message as read. Provider may no-op silently. */
  markSeen(userId: string, providerMsgId: string): Promise<ProviderResult>;
  /** Show typing indicator. Provider may no-op silently. */
  typing(userId: string, to: string, on: boolean): Promise<ProviderResult>;

  getStatus(userId: string): Promise<ProviderStatus>;

  /**
   * Validate that a phone number can receive messages via this provider.
   * Meta supports a real API check; QR returns "unknown" unless we have a
   * record of an outbound success.
   */
  validateRecipient(
    userId: string,
    phone: string,
  ): Promise<ProviderResult<{ exists: "yes" | "no" | "unknown" }>>;
}

/** Sentinel error codes — providers must use these for cross-provider checks. */
export const ERR = {
  NOT_IMPLEMENTED: "not_implemented",
  NOT_SUPPORTED: "not_supported",
  NOT_CONFIGURED: "not_configured",
  RATE_LIMITED: "rate_limited",
  WINDOW_EXPIRED: "window_24h_expired",
  CONSENT_MISSING: "consent_missing",
  TEMPLATE_NOT_APPROVED: "template_not_approved",
  PROVIDER_DOWN: "provider_down",
  UNKNOWN: "unknown",
} as const;
