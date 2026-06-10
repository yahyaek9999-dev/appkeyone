// Automation constants that are safe to import in client components.
// engine.ts imports prisma, so client components must import from here, not engine.ts.

export const AUTOMATION_TRIGGERS = [
  "score_crossed",
  "stage_changed",
  "idle_hours",
  "order_status_changed",
  "cart_abandoned",
  "order_value_gt", // order placed with value crossing a threshold
] as const;

export const AUTOMATION_ACTIONS = [
  "queue_follow_up",
  "tag_customer",
  "notify_admin",
  "add_to_segment_broadcast",
  "send_email", // via universal email providers (failover; graceful skip if none configured)
  "send_sms", // via universal SMS providers (failover; graceful skip if none configured)
] as const;

export const SCORE_METRICS = [
  "leadScore",
  "conversionScore",
  "hesitationScore",
  "churnRiskScore",
  "loyaltyScore",
  "retentionScore",
  "purchaseProb",
  "frustrationScore",
] as const;

export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];
export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number];
export type ScoreMetric = (typeof SCORE_METRICS)[number];
