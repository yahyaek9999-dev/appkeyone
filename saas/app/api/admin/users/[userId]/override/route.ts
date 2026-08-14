/**
 * Admin: per-customer plan override (custom deal).
 *   GET    /api/admin/users/[userId]/override   — fetch active override
 *   POST   /api/admin/users/[userId]/override   — create or replace override
 *   DELETE /api/admin/users/[userId]/override   — remove override
 *
 * Effective entitlements are re-computed from getEntitlements() which always
 * layers this override on top of the base plan. No caching of the result here.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";
import { PUBLIC_TIER_ORDER } from "@/lib/pricing/catalog";

export const dynamic = "force-dynamic";

type Ctx = { params: { userId: string } };

export async function GET(_req: Request, ctx: Ctx) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const { userId } = ctx.params;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const override = await (prisma as any).customerPlanOverride.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  }).catch(() => null);

  return NextResponse.json({ ok: true, user, override });
}

export async function POST(req: Request, ctx: Ctx) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const { userId } = ctx.params;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: any = {};
  try { body = await req.json(); } catch {}

  const baseSlug = body.baseSlug || null;
  if (baseSlug && !PUBLIC_TIER_ORDER.includes(baseSlug)) {
    return NextResponse.json({ error: "invalid_base_slug", valid: PUBLIC_TIER_ORDER }, { status: 400 });
  }

  let addCaps: string[] = [];
  try { addCaps = JSON.parse(body.addCaps || "[]"); } catch {}
  if (!Array.isArray(addCaps)) addCaps = [];

  let limitOverrides: Record<string, number> = {};
  try { limitOverrides = JSON.parse(body.limitOverrides || "{}"); } catch {}
  if (typeof limitOverrides !== "object" || Array.isArray(limitOverrides)) limitOverrides = {};

  const reason = String(body.reason || body.note || "").slice(0, 500);
  const adminNotes = String(body.adminNotes || "").slice(0, 1000);
  const startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

  if (expiresAt && expiresAt <= startsAt) {
    return NextResponse.json({ error: "expiry_before_start" }, { status: 400 });
  }

  const existing = await (prisma as any).customerPlanOverride.findFirst({ where: { userId } }).catch(() => null);

  const data = {
    userId,
    baseSlug: baseSlug || "k_start",
    addCaps: JSON.stringify(addCaps),
    limitOverrides: JSON.stringify(limitOverrides),
    reason,
    adminNotes,
    startsAt,
    expiresAt,
    createdBy: admin?.email || "admin",
    updatedAt: new Date(),
  };

  const override = existing
    ? await (prisma as any).customerPlanOverride.update({ where: { id: existing.id }, data })
    : await (prisma as any).customerPlanOverride.create({ data: { ...data, createdAt: new Date() } });

  await audit({
    userId,
    action: existing ? "admin.plan_override_updated" : "admin.plan_override_created",
    actorId: admin?.id || null,
    actorEmail: admin?.email || "admin",
    actorRole: "admin",
    targetType: "CustomerPlanOverride",
    targetId: override.id,
    metadata: { baseSlug, addCaps, limitOverrides, reason, startsAt, expiresAt },
    req,
  });

  return NextResponse.json({ ok: true, override });
}

export async function DELETE(req: Request, ctx: Ctx) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const { userId } = ctx.params;
  const existing = await (prisma as any).customerPlanOverride.findFirst({ where: { userId } }).catch(() => null);
  if (!existing) return NextResponse.json({ ok: true, removed: false });

  await (prisma as any).customerPlanOverride.delete({ where: { id: existing.id } });

  await audit({
    userId,
    action: "admin.plan_override_removed",
    actorId: admin?.id || null,
    actorEmail: admin?.email || "admin",
    actorRole: "admin",
    targetType: "CustomerPlanOverride",
    targetId: existing.id,
    metadata: {},
    req,
  });

  return NextResponse.json({ ok: true, removed: true });
}
