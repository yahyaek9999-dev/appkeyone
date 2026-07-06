/**
 * Daily Brain Learning cron (Phase 10). Internal-secret gated, fail-closed.
 * Aggregates anonymized GlobalBrainPatterns from BrainInsights + Orders + outcomes.
 */
import { NextResponse } from "next/server";
import { checkInternalSecret } from "@/lib/internal-auth";
import { runDailyBrainLearning } from "@/lib/brain/learning";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  if (!checkInternalSecret(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const r = await runDailyBrainLearning();
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ error: "learning_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }
