/**
 * QR Queue lifecycle cron — drives reservation activation/completion/expiry over
 * the finite QR session pool. Secured by x-internal-secret. Never sends WhatsApp.
 *
 * Each tick delegates to the engine's drive(): activate due reservations, settle
 * completed ones, mark no-shows + expirations.
 */
import { NextResponse } from "next/server";
import { checkInternalSecret } from "@/lib/internal-auth";
import { drive, qrQueueFlags } from "@/lib/qr-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  if (!checkInternalSecret(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!qrQueueFlags.enabled) return NextResponse.json({ ok: true, skipped: "queue_disabled" });

  try {
    const report = await drive();
    return NextResponse.json({ ok: true, ...report });
  } catch (e: any) {
    return NextResponse.json({ error: "drive_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }
