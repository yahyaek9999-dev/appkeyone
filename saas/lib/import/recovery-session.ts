/**
 * lib/import/recovery-session.ts — Recovery-only TEMPORARY QR session.
 *
 * A Bridge tenant cannot Import: Import reads contacts and history from a
 * linked whatsapp-web.js session, and the Cloud<->Bridge protocol has no verb
 * for it. That capability fact does not change here — Import stays QR-only.
 * What this module adds is a way to obtain a QR session *for the duration of
 * Recovery only*, without the tenant ever leaving Bridge.
 *
 * Everything it needs already exists and is reused verbatim:
 *
 *   wa.start(userId, { ephemeral: true })  — the service has always accepted
 *       this flag: the session is ephemeral from birth, never auto-reconnects
 *       (sessions.js), is never restored after a restart, self-destructs on the
 *       service TTL, and wipes its auth folder on teardown.
 *   wa.status()   — poll for the QR image and the connection state.
 *   runImportJob  — once connected, the EXISTING slot handler does the rest:
 *       wake -> markEphemeral -> exportData -> importData -> logout.
 *   wa.logout()   — teardown on cancel/expiry/failure.
 *
 * What this module deliberately does NOT do:
 *   - it never writes Bot.connectionMode (the tenant stays `bridge`)
 *   - it never touches the Bridge, its transport row, or its heartbeat
 *   - it never exposes QR anywhere but the Recovery flow
 *   - it never leaves a session behind: every terminal state logs out
 *   - it never retries or reconnects after a failure or expiry
 */

import { prisma } from "@/lib/db";
import { wa } from "@/lib/wa";
import { audit } from "@/lib/audit/log";
import { normalizeConnectionMode } from "@/lib/messaging/mode";
import { log } from "@/lib/import/import-engine";

/** How long a customer has to scan before we tear the session down. */
export const RECOVERY_SCAN_TTL_MS = Math.max(
  60_000,
  Number(process.env.RECOVERY_SCAN_TTL_MIN || 10) * 60_000,
);

/** Statuses this module owns. `queued`+ are handed to the existing import job. */
export type RecoveryState =
  | "idle"
  | "preparing"
  | "qr_ready"
  | "scanning"
  | "connected"
  | "importing"
  | "completed"
  | "failed"
  | "expired"
  | "cancelled";

export interface RecoveryView {
  state: RecoveryState;
  /** data-URL QR image; present only while the session is waiting to be scanned. */
  qr: string | null;
  error: string | null;
  expiresAt: string | null;
  session: any | null;
}

/** Recovery is the Bridge tenant's only door to Import. Everyone else uses the normal path. */
export async function isRecoveryTenant(userId: string): Promise<boolean> {
  const bot = await prisma.bot
    .findUnique({ where: { userId }, select: { connectionMode: true } as any })
    .catch(() => null);
  return normalizeConnectionMode((bot as any)?.connectionMode) === "bridge";
}

/** Marker kept in ImportSession.error while the temporary session is alive. */
const PENDING = "recovery_pending";
const SCAN_DEADLINE = /^recovery_pending:(\d+)$/;

function deadlineOf(err: string | null | undefined): number | null {
  const m = SCAN_DEADLINE.exec(String(err || ""));
  return m ? Number(m[1]) : null;
}

/**
 * Explicit customer action only — never called just because Recovery was opened.
 * Creates the temporary session and returns immediately; the UI polls for the QR.
 */
export async function startRecoverySession(userId: string): Promise<RecoveryView> {
  if (!(await isRecoveryTenant(userId))) {
    return { state: "failed", qr: null, error: "not_a_bridge_tenant", expiresAt: null, session: null };
  }

  const existing = await prisma.importSession.findUnique({ where: { userId } });
  if (existing && (existing.status === "completed" || existing.status === "closed")) {
    return { state: "completed", qr: null, error: null, expiresAt: null, session: existing };
  }

  const deadline = Date.now() + RECOVERY_SCAN_TTL_MS;
  const data = { status: "scanning", error: `${PENDING}:${deadline}`, requestedAt: new Date(), startedAt: new Date() };
  const session = existing
    ? await prisma.importSession.update({ where: { userId }, data })
    : await prisma.importSession.create({ data: { userId, ...data } });

  // Ephemeral from birth. If the service is down this is the only place it can
  // fail, and it fails visibly rather than leaving a half-started session.
  const started = await wa.start(userId, { ephemeral: true }).catch(() => null);
  if (!started?.ok) {
    await prisma.importSession.update({
      where: { userId },
      data: { status: "failed", error: "recovery_service_unavailable" },
    }).catch(() => {});
    await log(userId, session.id, "error", "تعذّر إنشاء جلسة الاسترداد المؤقتة — خدمة الربط غير متاحة.");
    return { state: "failed", qr: null, error: "recovery_service_unavailable", expiresAt: null, session };
  }

  await log(userId, session.id, "info", "تم إنشاء جلسة واتساب مؤقتة للاسترداد فقط — قناة Bridge لم تتغيّر.");
  void audit({ userId, action: "recovery.session_started", targetType: "import_session", targetId: session.id });
  return { state: "preparing", qr: null, error: null, expiresAt: new Date(deadline).toISOString(), session };
}

/**
 * Poll: surface the QR, notice the scan, and hand off to the existing import job.
 * Also enforces the scan deadline — an unscanned session is torn down, never left.
 */
export async function pollRecoverySession(userId: string): Promise<RecoveryView> {
  const session = await prisma.importSession.findUnique({ where: { userId } });
  if (!session) return { state: "idle", qr: null, error: null, expiresAt: null, session: null };

  if (session.status === "completed" || session.status === "closed") {
    return { state: "completed", qr: null, error: null, expiresAt: null, session };
  }
  if (session.status === "importing" || session.status === "queued" || session.status === "scheduled") {
    return { state: "importing", qr: null, error: null, expiresAt: null, session };
  }

  const deadline = deadlineOf(session.error);
  if (deadline === null) {
    // Not a live recovery session — report whatever the import engine left.
    const state: RecoveryState = session.status === "failed" ? "failed" : "idle";
    return { state, qr: null, error: session.error || null, expiresAt: null, session };
  }

  if (Date.now() > deadline) {
    await teardown(userId, "expired", "انتهت مهلة مسح رمز الاسترداد — تم إغلاق الجلسة المؤقتة.");
    const s = await prisma.importSession.findUnique({ where: { userId } });
    return { state: "expired", qr: null, error: "recovery_expired", expiresAt: null, session: s };
  }

  const status = await wa.status(userId).catch(() => null);
  const raw = (status?.data || {}) as { status?: string; qr?: string | null };

  if (!status?.ok) {
    return { state: "preparing", qr: null, error: null, expiresAt: new Date(deadline).toISOString(), session };
  }

  if (raw.status === "connected") {
    // Scanned. Hand off to the EXISTING import job — it wakes (already awake),
    // re-marks ephemeral, exports, imports, then logs out and wipes the auth.
    const { enqueueJob } = await import("@/lib/qr-pool/scheduler");
    const job = await enqueueJob({ userId, type: "import", refId: session.id, priority: 5 });
    const updated = await prisma.importSession.update({
      where: { userId },
      data: { status: "queued", error: null, qrJobId: job.id },
    });
    await log(userId, session.id, "info", "تم ربط الجلسة المؤقتة — جاري سحب البيانات.");
    void audit({ userId, action: "recovery.scanned", targetType: "import_session", targetId: session.id });
    return { state: "connected", qr: null, error: null, expiresAt: null, session: updated };
  }

  if (raw.status === "qr" && raw.qr) {
    return { state: "qr_ready", qr: raw.qr, error: null, expiresAt: new Date(deadline).toISOString(), session };
  }

  return { state: "preparing", qr: null, error: null, expiresAt: new Date(deadline).toISOString(), session };
}

/** Customer pressed cancel. Tear the temporary session down immediately. */
export async function cancelRecoverySession(userId: string): Promise<RecoveryView> {
  await teardown(userId, "cancelled", "تم إلغاء الاسترداد وإغلاق الجلسة المؤقتة.");
  const session = await prisma.importSession.findUnique({ where: { userId } });
  return { state: "cancelled", qr: null, error: "recovery_cancelled", expiresAt: null, session };
}

/**
 * The single teardown path for every terminal state. Logs the session out so the
 * service destroys the client and wipes its auth folder; never reconnects.
 * Bot.connectionMode is deliberately not touched — the tenant stays on Bridge.
 */
async function teardown(userId: string, outcome: "expired" | "cancelled" | "failed", message: string) {
  await wa.logout(userId).catch(() => {});
  const session = await prisma.importSession
    .update({ where: { userId }, data: { status: "failed", error: `recovery_${outcome}` } })
    .catch(() => null);
  if (session) await log(userId, session.id, "warn", message);
  void audit({ userId, action: `recovery.${outcome}`, targetType: "import_session", targetId: session?.id || userId });
}
