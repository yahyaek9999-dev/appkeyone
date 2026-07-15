/**
 * Meta Cloud webhook processor — Phase 2 cron.
 *
 * Drains unprocessed rows from `WaWebhookEvent` and applies them:
 *   - `messages` events  → forward to /api/whatsapp/incoming so the SAME
 *                          AI reply/anti-ban/sales/memory pipeline runs.
 *   - `statuses` events  → update WaMessage.status by providerMsgId.
 *   - Account / template events → update Bot / WaTemplate rows.
 *
 * Design choices:
 *   - We DO NOT duplicate the reply pipeline. The webhook layer simply
 *     normalizes Meta's payload and forwards to the existing incoming
 *     endpoint with the same internal-secret auth.
 *   - Failed processing increments `attempts` but never blocks future
 *     events (we move past poison messages after 5 attempts → dead-letter).
 *
 * Run cadence: every 30 seconds (e.g. NSSM scheduled task). The endpoint
 * is idempotent; concurrent invocations just race on the row update.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recordInbound, looksLikeRevoke, revokeConsent } from "@/lib/messaging/compliance";
import { checkInternalSecret } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

const SECRET = process.env.SAAS_INTERNAL_SECRET || "dev-internal-secret-change-me";
const INCOMING_URL = (process.env.NEXT_PUBLIC_BASE_URL || "http://127.0.0.1:3000") + "/api/whatsapp/incoming";
const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 25;

export async function POST(req: Request) {
  if (!checkInternalSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pending = await (prisma as any).waWebhookEvent.findMany({
    where: { processed: false, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { receivedAt: "asc" },
    take: BATCH_SIZE,
  });

  const results = { processed: 0, skipped: 0, deadLettered: 0, errors: [] as string[] };

  for (const ev of pending) {
    if (!ev.signatureOk) {
      // Untrusted webhook — record once, then mark processed so we don't loop.
      await markProcessed(ev.id, "signature_invalid");
      results.skipped++;
      continue;
    }

    try {
      const payload = JSON.parse(ev.rawBody);
      const change = payload?.entry?.[0]?.changes?.[0];
      const value = change?.value || {};
      const field = change?.field || ev.eventType;

      if (Array.isArray(value.messages) && value.messages.length) {
        await processInbound(ev.userId, value);
      }
      if (Array.isArray(value.statuses) && value.statuses.length) {
        await processStatuses(ev.userId, value.statuses);
      }
      if (field === "message_template_status_update" && value.message_template_name) {
        await syncTemplateStatus(ev.userId, value);
      }
      if (field === "account_alerts" || field === "phone_number_quality_update") {
        await syncAccountAlert(ev.userId, value);
      }

      await markProcessed(ev.id);
      results.processed++;
    } catch (e: any) {
      const msg = e?.message || String(e);
      await (prisma as any).waWebhookEvent.update({
        where: { id: ev.id },
        data: { attempts: { increment: 1 }, lastError: msg.slice(0, 500) },
      }).catch(() => {});
      results.errors.push(`${ev.id}: ${msg}`);
      if ((ev.attempts ?? 0) + 1 >= MAX_ATTEMPTS) results.deadLettered++;
    }
  }

  return NextResponse.json({ ok: true, ...results, pending: pending.length });
}

async function markProcessed(id: string, note?: string) {
  await (prisma as any).waWebhookEvent.update({
    where: { id },
    data: { processed: true, processedAt: new Date(), ...(note ? { lastError: note } : {}) },
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Inbound messages → forward to /api/whatsapp/incoming.
// We also stamp the 24h window via recordInbound and handle STOP keywords.
// ---------------------------------------------------------------------------
async function processInbound(userId: string | null, value: any) {
  if (!userId) return; // unowned webhook — skip silently
  for (const msg of value.messages) {
    const fromPhone: string = msg.from?.replace?.(/^\+/, "") || "";
    if (!fromPhone) continue;

    // Compliance stamp + STOP keyword detection (text only).
    await recordInbound(userId, fromPhone, "inbound_reply");
    const text: string = msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || "";
    if (text && looksLikeRevoke(text)) {
      await revokeConsent(userId, fromPhone, "STOP keyword from customer");
      continue; // do not pipe revoke messages into the AI reply pipeline
    }

    // Build a payload identical to the QR /incoming format.
    let mediaType: "text" | "voice" | "image" = "text";
    let payload: any = {
      event: "incoming",
      userId,
      from: { phone: fromPhone, name: value.contacts?.[0]?.profile?.name || null },
      mediaType,
      text,
    };

    if (msg.type === "audio" || msg.type === "voice") {
      mediaType = "voice";
      // Meta returns media IDs, not raw bytes. Phase 2.1 will fetch via
      // /media endpoint. For now we forward without bytes and the
      // transcription step will be a no-op (falls back to empty text).
      payload = { ...payload, mediaType, text: text || "[voice message]" };
    } else if (msg.type === "image") {
      mediaType = "image";
      payload = { ...payload, mediaType, text: msg.image?.caption || "[image]" };
    }

    try {
      const res = await fetch(INCOMING_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": SECRET },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`incoming endpoint returned ${res.status}`);
      }
    } catch (e) {
      // Re-throw so the outer catch increments attempts and retries
      // rather than marking this event processed with a dropped message.
      throw e;
    }
  }
}

// ---------------------------------------------------------------------------
// Delivery status updates: meta sends `statuses` for sent / delivered / read.
// We update WaMessage rows keyed by providerMsgId.
// ---------------------------------------------------------------------------
async function processStatuses(userId: string | null, statuses: any[]) {
  for (const s of statuses) {
    const providerMsgId = s.id;
    if (!providerMsgId) continue;
    const status = s.status; // sent | delivered | read | failed
    const ts = s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date();
    const data: any = { status };
    if (status === "sent")      data.sentAt      = ts;
    if (status === "delivered") data.deliveredAt = ts;
    if (status === "read")      data.readAt      = ts;
    if (status === "failed") {
      data.failedAt = ts;
      data.errorCode = s.errors?.[0]?.code ? String(s.errors[0].code) : "unknown";
      data.errorDetail = (s.errors?.[0]?.title || "").slice(0, 500);
    }
    await (prisma as any).waMessage.updateMany({
      where: { providerMsgId, ...(userId ? { userId } : {}) },
      data,
    }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Template status updates from Meta (APPROVED / REJECTED / PENDING / DISABLED).
// ---------------------------------------------------------------------------
async function syncTemplateStatus(userId: string | null, value: any) {
  if (!userId) return;
  const name: string = value.message_template_name;
  const language: string = value.message_template_language || "ar";
  const status: string = value.event || value.message_template_status || "PENDING";
  const reason: string | null = value.reason || null;
  await (prisma as any).waTemplate.upsert({
    where: { userId_name_language: { userId, name, language } },
    update: { status, rejectReason: reason, lastSyncedAt: new Date() },
    create: { userId, name, language, status, rejectReason: reason, category: "UTILITY" },
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Quality / messaging limit changes (Meta dashboard alerts).
// ---------------------------------------------------------------------------
async function syncAccountAlert(userId: string | null, value: any) {
  if (!userId) return;
  const data: any = {};
  if (value.current_limit) data.metaMessagingLimit = value.current_limit;
  if (value.event === "QUALITY_UPDATE" && value.new_quality_rating) {
    data.metaQualityRating = value.new_quality_rating;
  }
  if (Object.keys(data).length === 0) return;
  await prisma.bot.update({ where: { userId }, data: data as any }).catch(() => {});
  await (prisma as any).waComplianceAudit.create({
    data: {
      userId,
      provider: "meta_cloud",
      severity: data.metaQualityRating === "RED" ? "critical" : "warn",
      category: "quality",
      action: "warned",
      title: `account alert: ${value.event}`,
      detail: JSON.stringify(value).slice(0, 500),
    },
  }).catch(() => {});
}
