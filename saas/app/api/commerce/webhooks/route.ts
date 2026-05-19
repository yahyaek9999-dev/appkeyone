import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { resolveIntegrationFromRequest, sha256 } from "@/lib/commerce/security";
import { deriveExternalEventId, recordCommerceWebhookEvent } from "@/lib/commerce/events";
import { COMMERCE_EVENTS } from "@/lib/commerce/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getEventType(req: Request, payload: any): string {
  const header = req.headers.get("x-keyone-event") || req.headers.get("x-wc-webhook-topic") || req.headers.get("x-shopify-topic") || "";
  const raw = String(payload?.event || payload?.type || payload?.eventType || header || "order.created").toLowerCase();
  const mapped = raw
    .replace(/^orders\//, "order.")
    .replace(/^order\//, "order.")
    .replace(/^customers\//, "customer.")
    .replace(/^customer\//, "customer.")
    .replace("paid", "updated")
    .replace("cancelled", "cancelled")
    .replace("canceled", "cancelled")
    .replace("fulfilled", "shipped");
  if (COMMERCE_EVENTS.includes(mapped as any)) return mapped;
  if (mapped === "order.cancelled" || mapped === "order.canceled") return "order.cancelled";
  return mapped.slice(0, 80) || "order.created";
}

function getExternalOrderId(payload: any): string | null {
  const order = payload?.order || payload;
  const value = order?.id || order?.order_id || order?.orderId || order?.number || order?.name || null;
  return value === null || value === undefined ? null : String(value).slice(0, 160);
}

function getExternalEventId(req: Request, payload: any, integrationId: string, eventType: string, rawPayload: string): string {
  const header = req.headers.get("x-keyone-event-id") || req.headers.get("x-wc-webhook-delivery-id") || req.headers.get("x-shopify-webhook-id") || "";
  const bodyId = payload?.eventId || payload?.event_id || payload?.idempotencyKey || payload?.idempotency_key || null;
  return deriveExternalEventId({
    integrationId,
    eventType,
    externalEventId: header || bodyId,
    externalOrderId: getExternalOrderId(payload),
    rawPayload,
  });
}

export async function POST(req: Request) {
  const ipLimited = enforceRateLimit(req, { name: "commerce-webhook-ip", ...RATE_LIMITS.whatsapp });
  if (ipLimited) return ipLimited;

  const rawPayload = await req.text().catch(() => "");
  if (!rawPayload || rawPayload.length > 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "bad_payload" }, { status: 400 });
  }

  const verification = await resolveIntegrationFromRequest(req, rawPayload);
  if (!verification.ok || !verification.integration) {
    return NextResponse.json({ ok: false, error: verification.reason || "unauthorized" }, { status: 401 });
  }

  const tenantLimited = enforceRateLimit(req, {
    name: "commerce-webhook-tenant",
    identifier: verification.integration.id,
    limit: 120,
    windowSec: 60,
  });
  if (tenantLimited) return tenantLimited;

  let payload: any;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const eventType = getEventType(req, payload);
  const externalOrderId = getExternalOrderId(payload);
  const externalEventId = getExternalEventId(req, payload, verification.integration.id, eventType, rawPayload);

  const recorded = await recordCommerceWebhookEvent({
    integrationId: verification.integration.id,
    userId: verification.integration.userId,
    source: verification.integration.platform || "custom",
    eventType,
    externalEventId,
    externalOrderId,
    rawPayload,
    normalizedPayload: {
      eventType,
      externalOrderId,
      payloadHash: sha256(rawPayload),
    },
    signatureOk: verification.signatureOk,
  });

  if (!recorded.duplicate) {
    await (prisma as any).commerceIntegration.update({
      where: { id: verification.integration.id },
      data: { lastEventAt: new Date() },
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    accepted: !recorded.duplicate,
    duplicate: recorded.duplicate,
    eventId: recorded.eventId || null,
    status: recorded.status,
  });
}
