// lib/order-gate.ts
// Single authoritative decision for "should this conversation become an Order?"
// (BUG3). Used by the live inbound route AND the verification harness so the
// tested logic IS the shipped logic (no drift).
//
// Rules (all additive, none touch the send pipeline):
//   1. Media alone (image/voice/video with no typed words) + no purchase intent
//      + no payment keyword  → NEVER an order.
//   2. No genuine purchase intent AND no payment/order keyword → LEAD, not order
//      (price/availability/location/greeting messages).
//   3. No REAL product detected (the "منتج" placeholder doesn't count) and no
//      payment keyword → LEAD, not order.
//   4. Below the confidence threshold → skip (stays a lead).
//   5. requireProduct on but no real product → skip.
// Anything that passes all gates is a genuine order draft.

import { classifyMessageIntent, type MessageIntent } from "./message-intent";
import { extractOrderFast, type OrderDraft } from "./order-extractor";

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
  confidenceThreshold: number; // merchant setting (default 50)
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
  | "order";

export interface OrderGateResult {
  create: boolean;
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

  const done = (create: boolean, decision: OrderDecision, reason: string): OrderGateResult =>
    ({ create, decision, reason, intent: lastIntent.intent, draft });

  // 1) Media alone (image/voice/video with no typed words) never becomes an order
  //    on the strength of the media itself — needs PRIOR purchase intent or a
  //    typed payment receipt.
  if (mediaOnly && !priorIntent.buyIntent && !strongPayment) return done(false, "media_only", "media sent alone with no prior purchase intent");
  // 2) No genuine purchase intent and no payment receipt → LEAD, not order.
  //    (A weak keyword like "طلب" in a question does NOT create an order.)
  if (!effectiveBuyIntent && !strongPayment) return done(false, "no_buy_intent", `intent=${lastIntent.intent}, no purchase intent / receipt`);
  // 3) No REAL product (placeholder "منتج" doesn't count) and no receipt → LEAD.
  if (!draft.hasRealProduct && !strongPayment) return done(false, "no_real_product", "only the placeholder product");

  // A genuine receipt or a merchant keyword lowers the confidence bar to 30.
  const threshold = (strongPayment || weakFlag) ? Math.min(input.confidenceThreshold, 30) : input.confidenceThreshold;
  if (draft.confidence < threshold) return done(false, "low_confidence", `confidence ${draft.confidence} < ${threshold}`);
  if (input.requireProduct && !draft.hasRealProduct) return done(false, "require_product", "requireProduct on, no real product");

  return done(true, "order", "genuine purchase intent + product + confidence");
}
