// AI Intelligence Layer — shared types.
//
// This package is a STRICTLY READ-ONLY derivation layer that sits on top of the
// scores the message pipeline already writes (leadScore, conversionScore,
// hesitationScore, retention/loyalty/churn fields, negotiation state, sentiment
// history, order facts). It NEVER writes to the hot path, never touches the send
// pipeline, queue, billing, or commerce. Every function here is pure or a bounded
// read query. See KEYONE_CURRENT_STATE_AUDIT.md for why these are derivations,
// not new engines.

export type ValueTier = "platinum" | "gold" | "silver" | "bronze" | "lead";

export type SentimentTrend = "improving" | "declining" | "stable" | "unknown";

// One unified merchant-facing action. Fuses the tactical pieces that already
// exist (PersuasionMode, CtaType, suggestFollowUp) into a single decision the
// merchant can act on, with a confidence the merchant can trust.
export type NbaAction =
  | "close_now" // ready to buy — ask for the order
  | "offer_value" // price-sensitive — anchor on value, not discount
  | "build_trust" // trust objection — reassure with proof/guarantee
  | "reduce_friction" // hesitant but warm — remove one blocker
  | "answer_fast" // awaiting a reply on a hot question
  | "nudge_followup" // went quiet after interest — gentle nudge
  | "win_back" // lapsed past buyer — re-engage
  | "upsell" // just bought — suggest a complement
  | "escalate" // frustrated / needs a human
  | "nurture" // low signal — keep warm, no push
  | "hold"; // nothing actionable right now

export interface NbaInputs {
  // identity (for messaging only)
  customerName?: string | null;

  // scores already on the Customer row
  leadScore: number;
  conversionScore: number;
  hesitationScore: number;
  churnRiskScore: number;
  loyaltyScore: number;
  purchaseProb: number;
  frustrationScore: number;

  lastIntent?: string | null;
  lastSentiment?: string | null;

  // derived/contextual
  orderCount: number;
  daysSinceLastInbound: number; // 0 if seen today
  awaitingReply: boolean; // last message is from the customer
  valueTier: ValueTier;

  // objection + negotiation context (from CustomerMemory.factsJson)
  objections?: { price?: boolean; trust?: boolean; shipping?: boolean; quality?: boolean };
  discountAsks?: number;

  // Business-type module gates (from resolveBusinessContext). Optional and
  // backward-compatible: when undefined, every module is treated as ON so
  // existing callers (and Store tenants) behave exactly as before. Only used to
  // suppress module-specific advice (e.g. no product-upsell when products OFF).
  productsEnabled?: boolean;
}

export interface NbaFactor {
  signal: string; // what signal fired (e.g. "conversionScore")
  value: string; // human-readable value (e.g. "75")
  weight: "high" | "medium" | "low"; // contribution to the decision
  labelAr: string; // Arabic label shown in the expander
}

export interface NbaResult {
  action: NbaAction;
  confidence: number; // 0-100 — how sure we are this is the right move
  title: string; // short Arabic label for the merchant
  reason: string; // 1-line Arabic "why"
  suggestedMessage: string; // ready-to-paste Arabic message
  priority: number; // 0-100 ranking weight (urgency × value)
  // Reasoning transparency (Task 4): which signals contributed to this decision.
  // Pure presentation of values already computed — no new scores invented.
  factors: NbaFactor[];
}

export interface RevenueOpportunity {
  customerId: string;
  customerName: string | null;
  customerPhone: string;

  action: NbaAction;
  title: string;
  reason: string;
  suggestedMessage: string;

  confidence: number; // 0-100 (NBA confidence)
  estimatedValue: number; // EGP — forecasted deal size for this opportunity
  priority: number; // 0-100 — the global sort key (value × urgency × confidence)

  // provenance — which existing signals contributed (for transparency)
  valueTier: ValueTier;
  leadScore: number;
  conversionScore: number;
  churnRiskScore: number;
  daysSinceLastInbound: number;
}
