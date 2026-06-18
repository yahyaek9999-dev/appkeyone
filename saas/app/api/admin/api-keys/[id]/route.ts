/**
 * Admin — act on any tenant's API key.
 *   POST /api/admin/api-keys/:id — { action: "revoke" } → status=revoked.
 *
 * Admin-only (requireAdmin). The admin may revoke ANY key (lookup by id only),
 * so this intentionally does NOT scope by userId. Writes an AuditLog row.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = String(body.action || "");

  const key = await prisma.apiKey.findUnique({ where: { id: params.id }, select: { id: true, userId: true, status: true, name: true } });
  if (!key) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (action === "revoke") {
    try {
      if (key.status !== "revoked") {
        await prisma.apiKey.update({ where: { id: key.id }, data: { status: "revoked", revokedAt: new Date() } });
      }
      await audit({
        userId: key.userId,
        action: "admin.apikey_revoked",
        actorId: admin?.id || null,
        actorEmail: admin?.email || "admin",
        actorRole: "admin",
        targetType: "api_key",
        targetId: key.id,
        metadata: { name: key.name },
        req,
      });
      return NextResponse.json({ ok: true });
    } catch (e: any) {
      return NextResponse.json({ error: "revoke_failed", detail: String(e?.message || e) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
