import { prisma } from "@/lib/db";
import { sha256 } from "./security";
import type { CommerceEventInput, CommerceEventProcessResult } from "./types";

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "{}";
  }
}

export function deriveExternalEventId(args: {
  integrationId: string;
  eventType: string;
  externalEventId?: string | null;
  externalOrderId?: string | null;
  rawPayload: string;
}): string {
  if (args.externalEventId) return String(args.externalEventId).slice(0, 160);
  const basis = [args.integrationId, args.eventType, args.externalOrderId || "", sha256(args.rawPayload)].join(":");
  return sha256(basis);
}

export async function recordCommerceWebhookEvent(input: CommerceEventInput): Promise<CommerceEventProcessResult> {
  const payloadHash = sha256(input.rawPayload);
  try {
    const event = await (prisma as any).commerceWebhookEvent.create({
      data: {
        userId: input.userId,
        integrationId: input.integrationId,
        source: input.source,
        eventType: input.eventType,
        externalEventId: input.externalEventId,
        externalOrderId: input.externalOrderId || null,
        payloadHash,
        rawPayload: input.rawPayload,
        normalizedPayload: safeJson(input.normalizedPayload),
        signatureOk: input.signatureOk,
        status: "received",
        attempts: 0,
      },
      select: { id: true },
    });
    return { duplicate: false, eventId: event.id, status: "received" };
  } catch (e: any) {
    const duplicate = String(e?.code || "") === "P2002";
    if (duplicate) return { duplicate: true, status: "duplicate" };
    throw e;
  }
}

export async function markCommerceEventProcessed(eventId: string) {
  await (prisma as any).commerceWebhookEvent.update({
    where: { id: eventId },
    data: { status: "processed", attempts: { increment: 1 }, processedAt: new Date(), lastError: null },
  }).catch(() => {});
}

export async function markCommerceEventFailed(eventId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "unknown_error");
  await (prisma as any).commerceWebhookEvent.update({
    where: { id: eventId },
    data: { status: "failed", attempts: { increment: 1 }, lastError: message.slice(0, 500) },
  }).catch(() => {});
}
