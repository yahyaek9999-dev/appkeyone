export const COMMERCE_PLATFORMS = [
  "custom",
  "woocommerce",
  "shopify",
  "salla",
  "zid",
  "api",
] as const;
export const COMMERCE_EVENTS = [
  "order.created",
  "order.updated",
  "order.confirmed",
  "order.preparing",
  "order.shipped",
  "order.out_for_delivery",
  "order.delivered",
  "payment.failed",
  "order.cancelled",
  "customer.created",
] as const;
export const COMMERCE_CHANNELS = [
  "whatsapp",
  "email",
  "dashboard",
  "ai_followup",
  "analytics",
] as const;

export type CommercePlatform = (typeof COMMERCE_PLATFORMS)[number];
export type CommerceEventType = (typeof COMMERCE_EVENTS)[number];
export type CommerceChannel = (typeof COMMERCE_CHANNELS)[number];

export type CommerceIntegrationSummary = {
  id: string;
  userId: string;
  name: string;
  platform: CommercePlatform | string;
  enabled: boolean;
  apiKeyPrefix: string;
  webhookSecret?: string;
};

export type WebhookVerificationResult = {
  ok: boolean;
  reason?: string;
  signatureOk: boolean;
  integration?: CommerceIntegrationSummary;
};

export type CommerceEventInput = {
  integrationId: string;
  userId: string;
  source: string;
  eventType: string;
  externalEventId: string;
  externalOrderId?: string | null;
  rawPayload: string;
  normalizedPayload?: Record<string, unknown>;
  signatureOk: boolean;
};

export type CommerceEventProcessResult = {
  duplicate: boolean;
  eventId?: string;
  status: "received" | "processed" | "failed" | "duplicate";
  retryable?: boolean;
};
