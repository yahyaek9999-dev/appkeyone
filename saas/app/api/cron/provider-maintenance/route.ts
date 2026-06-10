import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkInternalSecret } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";

/**
 * Universal Providers — maintenance sweep.
 *
 * Triggered by a scheduled task (suggested cadence: daily). Prunes the
 * append-only ProviderCallLog so it never grows unbounded. Retention is
 * configurable via PROVIDER_LOG_RETENTION_DAYS (default 30). Idempotent,
 * internal-secret gated, never throws into the scheduler.
 *
 * Query params (optional):
 *   ?days=N   override retention window for this run
 */
export async function POST(req: Request) {
  if (!checkInternalSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const days = Math.max(
    1,
    Math.min(365, Number(url.searchParams.get("days") || process.env.PROVIDER_LOG_RETENTION_DAYS || 30)),
  );
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    const r = await (prisma as any).providerCallLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return NextResponse.json({ ok: true, pruned: r?.count ?? 0, olderThanDays: days });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 200 });
  }
}

// GET alias for schedulers that only issue GET.
export const GET = POST;
