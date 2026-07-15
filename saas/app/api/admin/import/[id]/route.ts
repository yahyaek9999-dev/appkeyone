/**
 * Admin per-session import operations.
 *   GET  /api/admin/import/:id — session detail + its ImportLog rows + QR job.
 *   POST /api/admin/import/:id — { action: "retry" | "cancel" }
 *        retry:  reset the session to "failed" then re-request (engine re-queues
 *                a fresh QR job — only "failed" sessions are reopenable).
 *        cancel: cancel the QR slot job + mark the session "failed".
 * Admin-only. Every action writes an AuditLog row.
 */
import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";
import { requestImport } from "@/lib/import/import-engine";
import { cancelJob } from "@/lib/qr-pool/scheduler";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try { await requireAdmin(); }
  catch (e) { return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) }); }

  try {
    const session = await prisma.importSession.findUnique({ where: { id: params.id } });
    if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const [user, logs, job] = await Promise.all([
      prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, email: true, name: true } }),
      prisma.importLog.findMany({
        where: { importSessionId: session.id },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      session.qrJobId ? prisma.qrSlotJob.findUnique({ where: { id: session.qrJobId } }) : Promise.resolve(null),
    ]);

    return NextResponse.json({ ok: true, session: { ...session, user }, logs, job });
  } catch (e: any) {
    return NextResponse.json({ error: "detail_unavailable", detail: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch (e) { return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) }); }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = String(body.action || "");

  const session = await prisma.importSession.findUnique({ where: { id: params.id } });
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const adminId = admin?.id || null;
  const adminEmail = admin?.email || "admin";

  try {
    if (action === "retry") {
      // Cancel any in-flight job, reset to a reopenable state, then re-request.
      if (session.qrJobId) await cancelJob(session.qrJobId).catch(() => {});
      await prisma.importSession.update({ where: { id: session.id }, data: { status: "failed", error: null } });
      const { session: next, alreadyExists } = await requestImport(session.userId);
      await audit({
        userId: session.userId, action: "import.retry", actorId: adminId, actorEmail: adminEmail, actorRole: "admin",
        targetType: "import_session", targetId: session.id, req,
      });
      return NextResponse.json({ ok: true, action: "retry", session: next, alreadyExists });
    }

    if (action === "cancel") {
      if (session.qrJobId) await cancelJob(session.qrJobId).catch(() => {});
      const next = await prisma.importSession.update({
        where: { id: session.id },
        data: { status: "failed", error: "canceled_by_admin" },
      });
      await audit({
        userId: session.userId, action: "import.cancel", actorId: adminId, actorEmail: adminEmail, actorRole: "admin",
        targetType: "import_session", targetId: session.id, req,
      });
      return NextResponse.json({ ok: true, action: "cancel", session: next });
    }

    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: "action_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
