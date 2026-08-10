// Revenue Copilot action attribution — creates a FollowUpTask when a merchant
// copies a suggested message. Seeds the self-learning loop so it has outcome
// data to learn from (reply rate / order conversion per action type).
//
// SAFE: only creates new FollowUpTask records. Does not touch the WhatsApp
// send pipeline, conversation state, or any existing record.

import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Maps Revenue Copilot NBA actions to FollowUpTask kinds — matches
// ACTION_TO_FOLLOWUP_KIND in lib/intelligence/revenue-opportunity.ts so the
// same self-learning weights apply to both surfaces.
const ACTION_KIND: Record<string, string> = {
  close_now:       "pending_order",
  answer_fast:     "pending_order",
  build_trust:     "hesitation_recovery",
  reduce_friction: "hesitation_recovery",
  offer_value:     "price_question",
  upsell:          "product_view",
  win_back:        "abandoned_conversation",
  nudge_followup:  "abandoned_conversation",
  nurture:         "abandoned_conversation",
};

export async function POST(req: Request) {
  const uid = await getUserIdForPermission("customers");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let body: {
    customerId?: string;
    action?: string;
    reason?: string;
    suggestedMessage?: string;
    estimatedValue?: number;
    confidence?: number;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { customerId, action, reason, suggestedMessage, estimatedValue = 0, confidence = 0 } = body;

  if (!customerId || !action) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // Verify this customer belongs to the authenticated merchant
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, userId: uid },
    select: { id: true },
  }).catch(() => null);

  if (!customer) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const kind = ACTION_KIND[action] || "smart_nudge";
  // Idempotency: one FollowUpTask per merchant × customer × action × day.
  // Prevents double-counting if the merchant copies the same message twice.
  const today = new Date().toISOString().slice(0, 10);
  const idempotencyKey = `copilot-${uid}-${customerId}-${action}-${today}`;

  await (prisma as any).followUpTask.upsert({
    where: { idempotencyKey },
    create: {
      userId: uid,
      customerId,
      kind,
      status: "sent",
      sentAt: new Date(),
      dueAt: new Date(),
      priority: Math.round(confidence),
      reason: reason || action,
      generatedText: suggestedMessage || "",
      context: JSON.stringify({
        source: "revenue_copilot",
        nbaAction: action,
        estimatedValue,
        confidence,
      }),
      idempotencyKey,
    },
    update: {
      // Re-copy on same day → bump sentAt, keep existing outcome fields.
      sentAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
