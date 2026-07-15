import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { wa } from "@/lib/wa";
import { chat as llmChat } from "@/lib/llm";
import { botProviderOverride } from "@/lib/providers/bot-provider";
import { appendExtras } from "@/lib/broadcasts/extras";
import { checkInternalSecret } from "@/lib/internal-auth";
import { evaluateOutbound } from "@/lib/messaging/compliance";
import { metaCloudAllowedForUser } from "@/lib/messaging/feature-flags";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// How many messages to send per cron tick (cron runs every minute).
const BATCH_SIZE = 20;
// Pause between sends (ms) — gentle on WhatsApp's rate limits.
const SEND_DELAY_MS = 2_500;
// A transient failure (network error / 5xx / 429) re-queues up to this many
// times before being marked permanently failed; each retry waits for the
// next cron tick (~60s), so this is also a natural backoff.
const MAX_SEND_RETRIES = 3;

// How many "sent"-but-unconfirmed items to reconcile per tick. Bounded so a
// large backlog can't make a single tick run long; it catches up over
// several ticks if needed.
const RECONCILE_BATCH_SIZE = 200;

/**
 * Corrects BroadcastItem.status for items marked "sent" (meaning "was
 * successfully queued", not "was delivered" — see waMessageId's schema
 * comment) whose linked WaMessage ultimately failed to actually deliver.
 * Without this, a queued-then-later-failed send stayed misreported as
 * "sent" forever — the broadcast's own sent/failed counters and the
 * analytics route (app/api/broadcasts/[id]/analytics) both read directly off
 * these fields, so this is real, customer-visible reporting accuracy.
 */
async function reconcileDeliveryStatus(): Promise<number> {
  const candidates = await prisma.broadcastItem.findMany({
    where: { status: "sent", waMessageId: { not: null } },
    orderBy: { sentAt: "asc" },
    take: RECONCILE_BATCH_SIZE,
    select: { id: true, broadcastId: true, waMessageId: true },
  });
  if (candidates.length === 0) return 0;

  const waIds = candidates.map((c) => c.waMessageId as string);
  const waMessages = await (prisma as any).waMessage.findMany({
    where: { id: { in: waIds } },
    select: { id: true, status: true, errorDetail: true },
  });
  const byId = new Map(waMessages.map((m: any) => [m.id, m]));

  let corrected = 0;
  for (const item of candidates) {
    const msg = byId.get(item.waMessageId as string) as any;
    if (!msg || msg.status !== "failed") continue; // still in flight or genuinely delivered — leave alone

    await prisma.$transaction([
      prisma.broadcastItem.update({
        where: { id: item.id },
        data: { status: "failed", error: `delivery failed: ${String(msg.errorDetail || "").slice(0, 200)}` },
      }),
      prisma.broadcast.update({
        where: { id: item.broadcastId },
        data: { sent: { decrement: 1 }, failed: { increment: 1 } },
      }),
    ]);
    corrected++;
  }
  return corrected;
}

/**
 * Drains pending Broadcast queues. Called by Windows Scheduled Task every
 * minute. Honors `status='canceled'` mid-run.
 */
export async function POST(req: Request) {
  if (!checkInternalSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const reconciled = await reconcileDeliveryStatus().catch((e) => {
    console.error("[broadcasts] delivery-status reconciliation failed:", e?.message || e);
    return 0;
  });

  // Pick the oldest due queued/sending broadcast across all users.
  // Scheduled campaigns (scheduledAt in the future) are held until due;
  // legacy/immediate broadcasts have scheduledAt = null and are always due.
  const bc = await prisma.broadcast.findFirst({
    where: {
      status: { in: ["queued", "sending"] },
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
    } as any,
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true } } },
  });
  if (!bc) return NextResponse.json({ ok: true, idle: true, reconciled });

  if (bc.status === "queued") {
    await prisma.broadcast.update({
      where: { id: bc.id },
      data: { status: "sending", startedAt: new Date() },
    });
  }

  // Recover orphaned claims before this tick: if a previous tick crashed
  // mid-send, items can be stuck in `sending` forever. Anything claimed more
  // than STALE_CLAIM_MS ago with no sentAt is safe to release back to pending.
  // Keeps the queue self-healing without a separate janitor.
  //
  // This threshold used to be declared but never actually applied (the query
  // had no time filter at all) — it reset EVERY `sending` item on EVERY tick,
  // regardless of age. With BATCH_SIZE=20 items * SEND_DELAY_MS=2.5s, one tick
  // can legitimately take up to ~50s against a 60s cron interval; a slow
  // upstream wa.send could push that past 60s, so a still-legitimately-
  // in-flight item from the previous (still-running) tick could have been
  // reset to `pending` and raced by this tick before its own atomic claim
  // below ever ran. There's no claimedAt column, so `updatedAt` (bumped by
  // the claim's own updateMany) is the closest proxy for "how long has this
  // been sending."
  const STALE_CLAIM_MS = 5 * 60_000;
  await prisma.broadcastItem.updateMany({
    where: {
      broadcastId: bc.id,
      status: "sending",
      sentAt: null,
      claimedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) },
    },
    data: { status: "pending" },
  });

  const items = await prisma.broadcastItem.findMany({
    where: { broadcastId: bc.id, status: "pending" },
    take: BATCH_SIZE,
  });

  // Load the bot once so we can route personalize calls through the
  // merchant's selected AI provider. Cheap (1 query) — far less than the
  // 20 broadcast item sends.
  const bot = await prisma.bot.findUnique({ where: { userId: bc.userId } });
  const provider = botProviderOverride(bot);

  // WhatsApp transport mode for compliance: Meta Cloud enforces the 24h window +
  // approved-template rule; QR is soft-allowed (anti-ban governs it). Resolved
  // once per broadcast (same merchant for every recipient).
  const waElig = await metaCloudAllowedForUser(bc.userId).catch(() => ({ allowed: false } as any));
  const waMode: "qr" | "meta_cloud" = waElig.allowed ? "meta_cloud" : "qr";

  if (items.length === 0) {
    // No `pending` items left — but a slower, still-running overlapping tick
    // (BATCH_SIZE=20 * SEND_DELAY_MS=2.5s + LLM personalization latency can
    // exceed the 60s cron interval) may still own items claimed `sending`.
    // Marking "done" here would remove this broadcast from the
    // status:{in:["queued","sending"]} query above forever — any item the
    // other tick later re-queues to `pending` (a transient-failure retry)
    // would then be permanently orphaned with no future tick able to see it.
    // Only finalize once nothing is pending OR still being sent.
    const inFlight = await prisma.broadcastItem.count({
      where: { broadcastId: bc.id, status: { in: ["pending", "sending"] } },
    });
    if (inFlight === 0) {
      await prisma.broadcast.update({
        where: { id: bc.id },
        data: { status: "done", finishedAt: new Date() },
      });
      return NextResponse.json({ ok: true, finished: bc.id, reconciled });
    }
    // Another tick still owns in-flight items — leave status as-is; the
    // stale-claim sweep above will reclaim them within STALE_CLAIM_MS if
    // that tick crashed, and a later tick will finalize once truly idle.
    return NextResponse.json({ ok: true, waitingOnInFlight: bc.id, inFlight, reconciled });
  }

  let sent = 0, failed = 0;
  let skippedClaim = 0;
  let skippedCompliance = 0;

  for (const it of items) {
    // Bail early if user canceled the broadcast
    const fresh = await prisma.broadcast.findUnique({
      where: { id: bc.id },
      select: { status: true },
    });
    if (fresh?.status === "canceled") {
      return NextResponse.json({ ok: true, canceled: true, reconciled });
    }

    // ---- Atomic claim: prevent duplicate sends from overlapping cron ticks ----
    // The previous tick can still be running this exact item (its wa.send may
    // take 1-3s, plus 2.5s sleep, plus LLM personalization). If we just call
    // wa.send() again, the customer receives the message TWICE. updateMany
    // with `where: { status: "pending" }` is atomic at the SQL level — only
    // ONE worker flips the row from pending → sending. The loser (count=0)
    // skips the item entirely; the winner owns it from here on.
    const claim = await prisma.broadcastItem.updateMany({
      where: { id: it.id, status: "pending" },
      data: { status: "sending", claimedAt: new Date() },
    });
    if (claim.count === 0) {
      // Another concurrent tick already grabbed this item.
      skippedClaim++;
      continue;
    }

    // ---- Meta compliance gate -----------------------------------------------
    // Never blast a customer who opted out or revoked consent (HARD, both modes).
    // Meta Cloud additionally enforces the 24h window + approved-template rule;
    // QR is soft-allowed by the engine (anti-ban governs throughput). Broadcasts
    // are free-form merchant text (not a Meta-approved template) → isTemplate=false.
    const optedOut = await prisma.customer
      .findFirst({ where: { userId: bc.userId, phone: it.phone, optedOutAt: { not: null } }, select: { id: true } })
      .then((c) => !!c)
      .catch(() => false);
    const decision = optedOut
      ? { allowed: false as const, reason: "opted_out" }
      : await evaluateOutbound({ userId: bc.userId, customerPhone: it.phone, provider: waMode, isTemplate: false });
    if (!decision.allowed) {
      await prisma.broadcastItem.update({
        where: { id: it.id },
        data: { status: "skipped", error: `compliance:${decision.reason}` },
      });
      skippedCompliance++;
      continue;
    }

    // ---- Build the OUTBOUND body --------------------------------------------
    // `original` is the merchant's verbatim template with {name}/{phone}
    // placeholders resolved. We NEVER drop it — if personalization fails or
    // drifts too far, we fall back to this exact string so the merchant gets
    // what they typed.
    const original = bc.template
      .replace(/\{name\}/g, it.name || "صديقنا")
      .replace(/\{phone\}/g, it.phone);
    let body = original;

    if (bc.personalize) {
      try {
        const personal = await llmChat(
          [
            {
              role: "system",
              content:
                "أنت تخصّص رسالة تسويقية لعميل واتس اب. " +
                "قواعد صارمة: " +
                "(1) لا تغيّر المعنى أو المحتوى أو العرض أو السعر أو الأرقام. " +
                "(2) فقط أعد صياغة بسيطة بنبرة دافئة طبيعية. " +
                "(3) حافظ على نفس طول النص تقريباً (لا تختصره ولا تطوّله أكثر من 30%). " +
                "(4) لا تضف عروضاً أو تفاصيل لم ترد في الأصل. " +
                "(5) أعد النص النهائي فقط بدون شرح أو علامات تنسيق.",
            },
            {
              role: "user",
              content: `الرسالة الأصلية:\n${original}\n\nاسم العميل: ${it.name || "غير معروف"}\nأعد صياغة بسيطة محافظة على المعنى والأرقام.`,
            },
          ],
          { provider }
        );
        const cleaned = String(personal || "").trim();
        // Drift guard: reject the LLM output if it changed length too much
        // or stripped numbers/prices the original contained. This keeps the
        // merchant's intent intact even when the LLM gets creative.
        const accepted = cleaned && isAcceptablePersonalization(original, cleaned);
        if (accepted) {
          body = cleaned;
        } else if (cleaned && !accepted) {
          // Drift rejected — keep original, audit so the merchant can see.
          if (sent + failed === 0) {
            await prisma.safetyAudit.create({
              data: {
                userId: bc.userId,
                level: "info",
                category: "broadcast",
                title: "رفض تخصيص — انحراف عن النص الأصلي",
                detail: "النموذج عدّل الطول أو الأرقام بشكل كبير. أُرسل النص الأصلي.",
                payload: JSON.stringify({ broadcastId: bc.id, origLen: original.length, newLen: cleaned.length }),
              },
            }).catch(() => {});
          }
        } else if (!cleaned) {
          // LLM returned an empty string — surface this so the merchant can
          // see WHY their personalized broadcast looks identical to the
          // template. Single audit row per broadcast (not per recipient).
          if (sent + failed === 0) {
            await prisma.safetyAudit.create({
              data: {
                userId: bc.userId,
                level: "info",
                category: "broadcast",
                title: "تخصيص الرسائل لم يُرجع نصاً",
                detail: "تم استخدام النص الأصلي. تأكد إن مزود الذكاء الاصطناعي مفعّل.",
                payload: JSON.stringify({ broadcastId: bc.id }),
              },
            }).catch(() => {});
          }
        }
      } catch (e: any) {
        // Persist the first failure of this broadcast so the merchant has
        // visibility — previously failures were silently swallowed and the
        // checkbox seemed cosmetic.
        if (sent + failed === 0) {
          await prisma.safetyAudit.create({
            data: {
              userId: bc.userId,
              level: "warn",
              category: "broadcast",
              title: "فشل تخصيص الرسائل بالذكاء الاصطناعي",
              detail: String(e?.message || e).slice(0, 400),
              payload: JSON.stringify({ broadcastId: bc.id, provider: (provider as any)?.kind || (provider as any)?.provider || "default" }),
            },
          }).catch(() => {});
        }
        console.warn("[broadcasts] personalize failed:", e?.message || e);
      }
    }

    // Append optional coupon + image link AFTER personalization so the LLM
    // can never reword/drop the coupon code. No-op when both are null.
    body = appendExtras(body, (bc as any).couponCode, (bc as any).imageUrl);

    const r = await wa.send(bc.userId, it.phone, body, "broadcast");
    if (r.ok) {
      // r.ok only means "successfully queued" (see waMessageId comment in
      // schema.prisma) — link the WaMessage id so the reconciliation sweep
      // below can catch up if delivery ultimately fails asynchronously.
      const waMessageId = (r.data as any)?.id ? String((r.data as any).id) : null;
      await prisma.broadcastItem.update({
        where: { id: it.id },
        data: { status: "sent", sentAt: new Date(), waMessageId },
      });
      sent++;
    } else {
      // Transient (network error / 5xx / 429) vs permanent (any other 4xx —
      // e.g. invalid number) failure. Previously every failure was permanent
      // on the first attempt, so a rate-limit blip or a momentary network
      // error to the wa-service permanently failed a recipient who would
      // otherwise have gone through fine on the next tick.
      const status = (r as any).status;
      const isTransient = status === 0 || status >= 500 || status === 429;
      const nextRetryCount = (it as any).retryCount + 1;
      if (isTransient && nextRetryCount <= MAX_SEND_RETRIES) {
        await prisma.broadcastItem.update({
          where: { id: it.id },
          data: {
            status: "pending", // re-enters the normal queue on the next tick
            retryCount: nextRetryCount,
            error: `retry ${nextRetryCount}/${MAX_SEND_RETRIES}: ${JSON.stringify(r.data).slice(0, 160)}`,
          },
        });
      } else {
        await prisma.broadcastItem.update({
          where: { id: it.id },
          data: { status: "failed", error: JSON.stringify(r.data).slice(0, 200) },
        });
        failed++;
      }
    }

    // small pause so WhatsApp doesn't ban the session
    await sleep(SEND_DELAY_MS);
  }

  await prisma.broadcast.update({
    where: { id: bc.id },
    data: {
      sent: { increment: sent },
      failed: { increment: failed },
    },
  });

  return NextResponse.json({ ok: true, broadcastId: bc.id, sent, failed, skippedClaim, skippedCompliance, waMode, reconciled });
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

// ---------------------------------------------------------------------------
// Drift guard for AI personalization.
//
// Returns true if the LLM's rewrite is a SAFE rephrasing of the merchant's
// original message. Rejects:
//   - length ratio outside 0.5x–1.5x of the original (LLM truncated or padded)
//   - any numeric/price token from the original that's missing in the rewrite
//   - mentions of an LLM refusal ("I cannot", "كمساعد ذكاء")
//
// Keeps the merchant's intent intact even when the model gets creative.
// ---------------------------------------------------------------------------
function isAcceptablePersonalization(original: string, rewrite: string): boolean {
  const o = original.trim();
  const r = rewrite.trim();
  if (!r) return false;

  // Length check: LLM should NOT drastically shorten or expand.
  const ratio = r.length / Math.max(1, o.length);
  if (ratio < 0.5 || ratio > 1.7) return false;

  // Number preservation: every distinct number in the original must appear
  // in the rewrite. Catches the common failure mode where the LLM "rounds"
  // a price (350 → 300) or drops a quantity ("3 أيام" → vague).
  const origNums = Array.from(new Set((o.match(/\d+/g) || []).filter((n) => n.length >= 2)));
  for (const n of origNums) {
    if (!r.includes(n)) return false;
  }

  // Refusal detection: if the LLM tried to refuse or explain, it's drift.
  const refusalSignals = /\b(i cannot|i can't|sorry, i|كمساعد|لا أستطيع|لا يمكنني|as an ai)\b/i;
  if (refusalSignals.test(r)) return false;

  return true;
}
