/**
 * QR Slot Scheduler cron — drives the shared QrSlotJob queue FIFO, booking the
 * existing Smart QR Pool for broadcast + import work. NEVER touches the send
 * pipeline: broadcast jobs PROMOTE a credit-queued campaign into the existing
 * drain; import jobs run the read-only importer. Secured by x-internal-secret.
 *
 * Each tick: reclaim stuck slots → reconcile running broadcast slots (settle
 * finished campaigns) → start new jobs up to the pool's concurrency budget.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkInternalSecret } from "@/lib/internal-auth";
import { qrPoolFlags } from "@/lib/qr-pool/flags";
import { claimNextJob, capacity, reclaimStuckJobs } from "@/lib/qr-pool/scheduler";
import { startBroadcastJob, reconcileBroadcastJob } from "@/lib/credits/broadcast-handler";
import { runImportJob } from "@/lib/import/import-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  if (!checkInternalSecret(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!qrPoolFlags.schedulerEnabled) return NextResponse.json({ ok: true, skipped: "scheduler_disabled" });

  const out = { reclaimed: 0, reconciled: 0, settled: 0, started: 0, imports: 0, errors: 0 };
  try {
    out.reclaimed = await reclaimStuckJobs();

    // Reconcile running broadcast slots (settle credits + free slot when done).
    const running = await prisma.qrSlotJob.findMany({ where: { status: "running", type: "broadcast" }, take: 50 });
    for (const job of running) {
      out.reconciled++;
      const r = await reconcileBroadcastJob(job).catch((e) => ({ error: String(e?.message || e) }));
      if ((r as any).done) out.settled++;
    }

    // Start new jobs up to capacity.
    let slots = await capacity();
    while (slots > 0) {
      const job = await claimNextJob("qr-scheduler");
      if (!job) break;
      slots--;
      try {
        if (job.type === "broadcast") {
          await startBroadcastJob(job);
          out.started++;
        } else if (job.type === "import") {
          await runImportJob(job); // runs to completion inline; frees its slot
          out.imports++;
        }
      } catch (e) {
        out.errors++;
      }
    }
  } catch (e: any) {
    return NextResponse.json({ error: "scheduler_failed", detail: String(e?.message || e) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...out });
}

export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }
