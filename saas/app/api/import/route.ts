/**
 * GET  /api/import — current tenant's One-Time QR Import session + live progress.
 *   → { ok, session, queuePosition, logs }
 *     queuePosition: 1-based position in the QR slot queue (0 when not queued).
 *     logs: last 20 ImportLog rows (newest first).
 * POST /api/import — request the one-time import.
 *   → { ok, session, alreadyExists }
 *     If a completed/closed session already exists the import is NOT re-run
 *     (one-time, closed forever); we simply return the existing session.
 *
 * Owner-only: gated by the "customers" permission. A member without it is 401.
 */
import { NextResponse } from "next/server";
import { getUserForPermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requestImport, getImportSession } from "@/lib/import/import-engine";
import { queuePosition } from "@/lib/qr-pool/scheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUserForPermission("customers");
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const session = await getImportSession(user.id);
    if (!session) {
      return NextResponse.json({ ok: true, session: null, queuePosition: 0, logs: [] });
    }

    const [position, logs] = await Promise.all([
      session.qrJobId ? queuePosition(session.qrJobId).catch(() => 0) : Promise.resolve(0),
      prisma.importLog.findMany({
        where: { userId: user.id, importSessionId: session.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    return NextResponse.json({ ok: true, session, queuePosition: position, logs });
  } catch (e: any) {
    return NextResponse.json({ error: "import_unavailable", detail: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST() {
  const user = await getUserForPermission("customers");
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const existing = await getImportSession(user.id);
    // One-time: a completed/closed session is done forever — never re-run.
    if (existing && (existing.status === "completed" || existing.status === "closed")) {
      return NextResponse.json({ ok: true, session: existing, alreadyExists: true });
    }

    const { session, alreadyExists } = await requestImport(user.id);
    return NextResponse.json({ ok: true, session, alreadyExists });
  } catch (e: any) {
    return NextResponse.json({ error: "request_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
