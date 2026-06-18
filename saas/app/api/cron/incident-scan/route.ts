/** Incident detection sweep cron (Phase 4/6). Internal-secret gated, fail-closed. */
import { NextResponse } from "next/server";
import { checkInternalSecret } from "@/lib/internal-auth";
import { scanForIncidents } from "@/lib/incidents/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  if (!checkInternalSecret(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const r = await scanForIncidents();
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ error: "scan_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }
