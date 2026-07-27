// lib/order-gate.ts
// Single authoritative decision for "should this conversation become an Order?"
// (BUG3). Used by the live inbound route AND the verification harness so the
// tested logic IS the shipped logic (no drift).
//
// Confidence tiers:
//   HIGH   (≥ 95): auto-create order, no confirmation needed
//   MEDIUM (≥ 70): create order but flag as needs-merchant-review
//   LOW    (< 70): do not create; treat as a chat-only lead
//
// Additional hard rules (applied before confidence tiers):
//   1. Media alone (image/voice/video with no typed words) + no purchase intent
//      + no payment keyword  → NEVER an order.
//   2. No genuine purchase intent AND no payment/order keyword → LEAD, not order
//      (price/availability/location/greeting messages).
//   3. No REAL product detected (the "منتج" placeholder doesn't count) and no
//      payment keyword → LEAD, not order.
//   4. requireProduct on but no real product → skip.
// Anything that passes all hard rules is gated by confidence tier.

import { classifyMessageIntent, type MessageIntent } from "./message-intent";
import { extractOrderFast, type OrderDraft } from "./order-extractor";

// Confidence thresholds — production-tuned, not merchant-configurable so
// merchants can't accidentally lower them to junk-order territory.
const HIGH_CONFIDENCE_THRESHOLD = 95;  // auto-create
const MEDIUM_CONFIDENCE_THRESHOLD = 70; // create with merchant review flag

export interface OrderGateInput {
  historyTail: { role: string; content: string }[];
  customerName?: string | null;
  customerPhone?: string;
  /** merchant order-keyword hit in the customer's TYPED text — lowers the confidence bar only */
  flaggedKeyword: boolean;
  mediaType?: string;          // "text" | "voice" | "image" | "video" | "document"
  rawText?: string;            // the customer's actually-typed text (empty for pure media)
  /** what the customer actually TYPED (=== last message for text; rawText for media). Used to detect payment receipts. */
  typedText?: string;
  confidenceThreshold: number; // merchant setting — used only as a floor (clamped to MEDIUM_CONFIDENCE_THRESHOLD)
  requireProduct?: boolean;
}

// A STRONG payment/receipt signal (completion verbs + receipt noun) — the only
// thing allowed to authorise an order WITHOUT explicit purchase intent or a real
// product. Deliberately excludes bare payment-method words ("فيزا", "فودافون
// كاش") and the weak "طلب"/"اوردر", which appear in ordinary questions
// ("لو طلبت", "بتقبلوا فيزا؟").
const STRONG_PAYMENT_RE =
  /(حولت|حوّلت|حولتلك|حولتلكم|حوالة|حواله|دفعت|اتدفع|تحويل بنكي|انستاباي|instapay|ايصال|إيصال|receipt|i paid|paid|transferred)/i;

export type OrderDecision =
  | "media_only"
  | "no_buy_intent"
  | "no_real_product"
  | "low_confidence"
  | "require_product"
  | "order"
  | "order_needs_review";  // medium confidence — create but flag for merchant

export interface OrderGateResult {
  create: boolean;
  /** true when the order was created but is in the 70-94 confidence range — merchant should review */
  needsReview: boolean;
  decision: OrderDecision;
  reason: string;
  intent: MessageIntent;
  draft: OrderDraft;
}

export function decideOrder(input: OrderGateInput): OrderGateResult {
  const userMsgs = (input.historyTail || []).filter((m) => m.role === "user");
  const lastMsg = userMsgs.slice(-1)[0]?.content || "";
  const priorMsgs = userMsgs.slice(0, -1);           // everything BEFORE the current message

  const mediaOnly = !!input.mediaType && input.mediaType !== "text" && !(input.rawText || "").trim();
  // STRONG receipt signal must come from the customer's TYPED text (never an AI
  // media description), so a receipt *image* alone cannot self-authorise.
  const strongPayment = STRONG_PAYMENT_RE.test(input.typedText || "");
  // The merchant's weak order keyword only LOWERS the confidence bar; it never
  // bypasses the intent / product requirement.
  const weakFlag = !!input.flaggedKeyword;

  // Purchase intent computed two ways so a bare media message can't authorize an
  // order from its OWN transcript — only PRIOR typed intent (or a receipt) may.
  // Text messages use the full recent tail.
  const priorIntent = classifyMessageIntent(priorMsgs.slice(-6).map((m) => m.content).join("\n"));
  const fullIntent = classifyMessageIntent(userMsgs.slice(-6).map((m) => m.content).join("\n"));
  const lastIntent = classifyMessageIntent(lastMsg);
  const effectiveBuyIntent = mediaOnly ? priorIntent.buyIntent : fullIntent.buyIntent;

  const draft = extractOrderFast({
    messages: input.historyTail,
    fallbackCustomerName: input.customerName,
    fallbackCustomerPhone: input.customerPhone,
  });

  const done = (
    create: boolean,
    decision: OrderDecision,
    reason: string,
    needsReview = false,
  ): OrderGateResult => ({ create, needsReview, decision, reason, intent: lastIntent.intent, draft });

  // Hard rule 1) Media alone never becomes an order without prior purchase intent or receipt.
  if (mediaOnly && !priorIntent.buyIntent && !strongPayment) return done(false, "media_only", "media sent alone with no prior purchase intent");
  // Hard rule 2) No genuine purchase intent and no payment receipt → LEAD.
  if (!effectiveBuyIntent && !strongPayment) return done(false, "no_buy_intent", `intent=${lastIntent.intent}, no purchase intent / receipt`);
  // Hard rule 3) No REAL product and no receipt → LEAD.
  if (!draft.hasRealProduct && !strongPayment) return done(false, "no_real_product", "only the placeholder product");
  // Hard rule 4) requireProduct on but no real product → skip.
  if (input.requireProduct && !draft.hasRealProduct) return done(false, "require_product", "requireProduct on, no real product");

  // A genuine receipt or a merchant keyword lowers the confidence floor to 30.
  const receiptOrFlag = strongPayment || weakFlag;

  // Effective minimum threshold: the higher of merchant's setting and MEDIUM floor,
  // unless a receipt/keyword lowers to 30.
  const effectiveMin = receiptOrFlag ? 30 : Math.max(input.confidenceThreshold, MEDIUM_CONFIDENCE_THRESHOLD);

  if (draft.confidence < effectiveMin) {
    return done(false, "low_confidence", `confidence ${draft.confidence} < ${effectiveMin}`);
  }

  // Confidence tiers
  if (draft.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    return done(true, "order", "high confidence — genuine purchase intent + product");
  }

  // Medium confidence (70-94): create but flag for merchant review
  return done(true, "order_needs_review", `medium confidence ${draft.confidence} — create with review flag`, true);
}
