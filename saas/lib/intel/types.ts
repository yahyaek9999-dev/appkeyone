// Sales Intelligence — shared types.
//
// All four detectors (lost-customers, upsell, hot-leads, follow-up-ops) return
// the same shape. The merchant page renders them with one component and one
// "Copy + Open conversation" action — no LLM, no auto-send. Anti-ban-safe by
// design: every send is a manual merchant action.

export type IntelKind =
  | "lost_customer" // showed intent, then went silent
  | "upsell" // recent order completed; suggest related item
  | "hot_lead" // high engagement, no order yet
  | "follow_up_op"; // asked about price/product, no order

export interface IntelItem {
  /** unique within a single response, used as React key */
  id: string;
  kind: IntelKind;

  // ---- Target ----
  customerId: string;
  customerName: string | null;
  customerPhone: string;

  // ---- Signal strength (0..100) ----
  urgency: number;

  // ---- Merchant-facing copy ----
  /** short Arabic label, e.g. "اهتم بالسعر ثم اختفى" */
  title: string;
  /** 1-line Arabic explanation of WHY the rule fired */
  reason: string;
  /** ready-to-paste Arabic message the merchant can send as-is */
  suggestedMessage: string;

  // ---- Optional context ----
  lastInteractionAt?: string; // ISO
  daysSinceLastMsg?: number;
  leadScore?: number;
  conversionScore?: number; // 0-100 conversion probability
  hesitationScore?: number; // 0-100 hesitation / objection risk
  insightLabel?: string; // merchant-facing business insight chip
  lastIntent?: string | null;
  orderId?: string; // for upsell
  orderTotal?: number; // for upsell
}

export interface IntelResponse {
  generatedAt: string;
  counts: Record<IntelKind, number>;
  items: {
    lost_customer: IntelItem[];
    upsell: IntelItem[];
    hot_lead: IntelItem[];
    follow_up_op: IntelItem[];
  };
}
