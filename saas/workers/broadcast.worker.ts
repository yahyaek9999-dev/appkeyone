/**
 * Broadcast Worker — BullMQ consumer for the keyone:broadcasts queue.
 *
 * Mirrors the business logic in app/api/cron/broadcasts/route.ts but runs
 * as a long-lived, standalone process instead of a one-shot Next.js route.
 *
 * Design principles:
 *   - Same send loop as the cron route (atomic claim, SEND_DELAY_MS pacing,
 *     LLM personalization, drift guard, SafetyAudit writes).
 *   - Each BullMQ job processes ONE broadcast (all its pending items in the
 *     current batch). The job is retried automatically on crash.
 *   - Graceful shutdown: finishes the current item before exiting on SIGTERM.
 *   - Does NOT import any Next.js internals (no `next/server`, no `@/app/`).
 *     Only imports from `@/lib/` which are plain Node.js modules.
 *
 * Run as: node --loader ts-node/esm workers/index.ts
 *         (or compiled: node dist/workers/index.js)
 */

import { Worker, type Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import type { BroadcastJobData } from "../lib/queue";
import {
  QUEUE_NAMES,
  getWorkerConnection,
  sendToDeadLetter,
} from "../lib/queue";

// ---------------------------------------------------------------------------
// Prisma — standalone connection (NOT the Next.js singleton from lib/db.ts)
// ---------------------------------------------------------------------------
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

// ---------------------------------------------------------------------------
// WhatsApp service helper (inlined to avoid @/ alias resolution issues)
// ---------------------------------------------------------------------------
const WA_BASE = process.env.WHATSAPP_SERVICE_URL || "http://127.0.0.1:3001";
const WA_SECRET =
  process.env.SAAS_INTERNAL_SECRET || "dev-internal-secret-change-me";

async function waSend(
  userId: string,
  to: string,
  text: string,
): Promise<{ ok: boolean; data: unknown }> {
  try {
    const res = await fetch(`${WA_BASE}/sessions/${userId}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": WA_SECRET,
      },
      body: JSON.stringify({ to, text }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch (e: any) {
    return { ok: false, data: { error: e?.message ?? String(e) } };
  }
}

// ---------------------------------------------------------------------------
// LLM helper — calls the in-house API directly (same env vars as lib/llm.ts)
// ---------------------------------------------------------------------------
const LLM_URLS = (process.env.MSE_AI_API_URLS || process.env.AI_BASE_URL || "")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

const LLM_KEY = process.env.MSE_AI_API_KEY || "";

async function callLlm(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  if (!LLM_URLS.length) throw new Error("No LLM URLs configured");
  const url = LLM_URLS[0]; // simple round-robin omitted for brevity
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LLM_KEY}`,
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const json = await res.json();
  return (
    json?.choices?.[0]?.message?.content || json?.content || json?.text || ""
  );
}

// ---------------------------------------------------------------------------
// Drift guard (identical to the one in cron/broadcasts/route.ts)
// ---------------------------------------------------------------------------
function isAcceptablePersonalization(
  original: string,
  rewrite: string,
): boolean {
  const o = original.trim();
  const r = rewrite.trim();
  if (!r) return false;
  const ratio = r.length / Math.max(1, o.length);
  if (ratio < 0.5 || ratio > 1.7) return false;
  const origNums = Array.from(
    new Set((o.match(/\d+/g) || []).filter((n) => n.length >= 2)),
  );
  for (const n of origNums) {
    if (!r.includes(n)) return false;
  }
  const refusalSignals =
    /\b(i cannot|i can't|sorry, i|كمساعد|لا أستطيع|لا يمكنني|as an ai)\b/i;
  if (refusalSignals.test(r)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Send configuration
// ---------------------------------------------------------------------------
const BATCH_SIZE = 20;
const SEND_DELAY_MS = 2_500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Core broadcast processor
// ---------------------------------------------------------------------------
async function processBroadcast(job: Job<BroadcastJobData>): Promise<void> {
  const { broadcastId, userId, batchSize = BATCH_SIZE } = job.data;

  const bc = await prisma.broadcast.findFirst({
    where: { id: broadcastId, userId },
    include: { user: { select: { id: true } } },
  });

  if (!bc) {
    console.warn(
      `[broadcast.worker] broadcast ${broadcastId} not found — skipping`,
    );
    return;
  }

  if (bc.status === "canceled") {
    console.log(
      `[broadcast.worker] broadcast ${broadcastId} canceled — skipping`,
    );
    return;
  }

  // Advance status from queued → sending
  if (bc.status === "queued") {
    await prisma.broadcast.update({
      where: { id: bc.id },
      data: { status: "sending", startedAt: new Date() },
    });
  }

  // Recover orphaned claims (worker crashed mid-send)
  await (prisma.broadcastItem as any).updateMany({
    where: { broadcastId: bc.id, status: "sending", sentAt: null },
    data: { status: "pending" },
  });

  // Fetch the bot for provider routing
  const bot = await (prisma.bot as any).findUnique({ where: { userId } });

  // Load next batch of pending items
  const items = await (prisma.broadcastItem as any).findMany({
    where: { broadcastId: bc.id, status: "pending" },
    take: batchSize,
  });

  if (items.length === 0) {
    await prisma.broadcast.update({
      where: { id: bc.id },
      data: { status: "done", finishedAt: new Date() },
    });
    console.log(
      `[broadcast.worker] broadcast ${broadcastId} finished (all items sent)`,
    );
    return;
  }

  let sent = 0;
  let failed = 0;
  let skippedClaim = 0;

  for (const it of items) {
    // Check for cancellation between items
    const fresh = await (prisma.broadcast as any).findUnique({
      where: { id: bc.id },
      select: { status: true },
    });
    if (fresh?.status === "canceled") {
      console.log(
        `[broadcast.worker] broadcast ${broadcastId} canceled mid-run`,
      );
      break;
    }

    // Atomic claim: prevent duplicate sends from concurrent workers
    const claim = await (prisma.broadcastItem as any).updateMany({
      where: { id: it.id, status: "pending" },
      data: { status: "sending" },
    });
    if (claim.count === 0) {
      skippedClaim++;
      continue;
    }

    // Resolve body with placeholder substitution
    const original = (bc.template as string)
      .replace(/\{name\}/g, it.name || "صديقنا")
      .replace(/\{phone\}/g, it.phone);
    let body = original;

    // Personalization (optional, matches cron logic exactly)
    if (bc.personalize) {
      try {
        const cleaned = (
          await callLlm(
            "أنت تخصّص رسالة تسويقية لعميل واتس اب. " +
              "قواعد صارمة: " +
              "(1) لا تغيّر المعنى أو المحتوى أو العرض أو السعر أو الأرقام. " +
              "(2) فقط أعد صياغة بسيطة بنبرة دافئة طبيعية. " +
              "(3) حافظ على نفس طول النص تقريباً (لا تختصره ولا تطوّله أكثر من 30%). " +
              "(4) لا تضف عروضاً أو تفاصيل لم ترد في الأصل. " +
              "(5) أعد النص النهائي فقط بدون شرح أو علامات تنسيق.",
            `الرسالة الأصلية:\n${original}\n\nاسم العميل: ${it.name || "غير معروف"}\nأعد صياغة بسيطة محافظة على المعنى والأرقام.`,
          )
        ).trim();

        if (cleaned && isAcceptablePersonalization(original, cleaned)) {
          body = cleaned;
        } else if (sent + failed === 0) {
          // Audit: drift rejected or empty — log once per broadcast
          await (prisma.safetyAudit as any)
            .create({
              data: {
                userId,
                level: "info",
                category: "broadcast",
                title: cleaned
                  ? "رفض تخصيص — انحراف عن النص الأصلي"
                  : "تخصيص الرسائل لم يُرجع نصاً",
                detail: cleaned
                  ? "النموذج عدّل الطول أو الأرقام بشكل كبير. أُرسل النص الأصلي."
                  : "تم استخدام النص الأصلي. تأكد إن مزود الذكاء الاصطناعي مفعّل.",
                payload: JSON.stringify({
                  broadcastId: bc.id,
                  origLen: original.length,
                  newLen: cleaned.length,
                }),
              },
            })
            .catch(() => {});
        }
      } catch (e: any) {
        if (sent + failed === 0) {
          await (prisma.safetyAudit as any)
            .create({
              data: {
                userId,
                level: "warn",
                category: "broadcast",
                title: "فشل تخصيص الرسائل بالذكاء الاصطناعي",
                detail: String(e?.message ?? e).slice(0, 400),
                payload: JSON.stringify({ broadcastId: bc.id }),
              },
            })
            .catch(() => {});
        }
        console.warn("[broadcast.worker] personalize failed:", e?.message);
      }
    }

    // Send via WhatsApp service
    const r = await waSend(userId, it.phone, body);
    if (r.ok) {
      await (prisma.broadcastItem as any).update({
        where: { id: it.id },
        data: { status: "sent", sentAt: new Date() },
      });
      sent++;
    } else {
      await (prisma.broadcastItem as any).update({
        where: { id: it.id },
        data: {
          status: "failed",
          error: JSON.stringify(r.data).slice(0, 200),
        },
      });
      failed++;
    }

    await sleep(SEND_DELAY_MS);
  }

  // Update aggregate counters on the broadcast row
  await prisma.broadcast.update({
    where: { id: bc.id },
    data: { sent: { increment: sent }, failed: { increment: failed } } as any,
  });

  // If there are still pending items, re-enqueue for the next batch
  const remaining = await (prisma.broadcastItem as any).count({
    where: { broadcastId: bc.id, status: "pending" },
  });

  if (remaining > 0) {
    // BullMQ will re-run this job automatically if we re-add it,
    // but the cleaner pattern is to mark the job done and let the
    // QueueScheduler / repeat job pick it up.  For now, we log and
    // rely on the outer retry or a scheduled re-queue from the API.
    console.log(
      `[broadcast.worker] broadcast ${broadcastId} batch done (${sent} sent, ${failed} failed, ${remaining} remaining, ${skippedClaim} skipped). Needs another run.`,
    );
  } else {
    await prisma.broadcast.update({
      where: { id: bc.id },
      data: { status: "done", finishedAt: new Date() },
    });
    console.log(
      `[broadcast.worker] broadcast ${broadcastId} complete (${sent} sent, ${failed} failed)`,
    );
  }

  void bot; // referenced above for future provider routing; suppress unused warning
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

let _worker: Worker | null = null;

/**
 * Start the broadcast BullMQ worker.
 * Returns the Worker instance so the caller can await its close().
 */
export function startBroadcastWorker(): Worker {
  if (_worker) return _worker;

  const connection = getWorkerConnection();

  _worker = new Worker<BroadcastJobData>(
    QUEUE_NAMES.broadcasts,
    async (job: Job<BroadcastJobData>) => {
      console.log(
        `[broadcast.worker] processing job ${job.id} (broadcast ${job.data.broadcastId})`,
      );
      await processBroadcast(job);
    },
    {
      connection: connection as any,
      concurrency: 1, // Never run two broadcast workers in parallel (WA rate-limit)
      lockDuration: 120_000, // 2 minutes — matches maxDuration of the cron route
    },
  );

  _worker.on("completed", (job: any) => {
    console.log(`[broadcast.worker] job ${job.id} completed`);
  });

  _worker.on("failed", async (job: any, err: any) => {
    console.error(`[broadcast.worker] job ${job?.id} failed:`, err.message);
    // Move terminal failures to dead-letter queue
    if (job && (job.attemptsMade ?? 0) >= (job.opts?.attempts ?? 5)) {
      await sendToDeadLetter({
        originalQueue: QUEUE_NAMES.broadcasts,
        originalJobId: job.id,
        originalData: job.data,
        failedReason: err.message,
        failedAt: new Date().toISOString(),
      });
    }
  });

  _worker.on("error", (err: any) => {
    console.error("[broadcast.worker] worker error:", err.message);
  });

  console.log(
    "[broadcast.worker] started, listening on",
    QUEUE_NAMES.broadcasts,
  );
  return _worker;
}

/**
 * Gracefully shut down the broadcast worker.
 * Waits for the current job to finish before closing.
 */
export async function stopBroadcastWorker(): Promise<void> {
  if (!_worker) return;
  console.log("[broadcast.worker] shutting down...");
  await _worker.close();
  await prisma.$disconnect();
  _worker = null;
  console.log("[broadcast.worker] stopped.");
}
