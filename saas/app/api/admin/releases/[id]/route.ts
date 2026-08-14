/**
 * PATCH /api/admin/releases/[id] — update a release (status, name, description, sortOrder)
 * DELETE /api/admin/releases/[id] — archive a release (sets status to archived)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin as _requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";
import { invalidateFeatureCache } from "@/lib/feature-control";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  try {
    const user = await _requireAdmin();
    return { userId: user.id, email: user.email };
  } catch {
    return null;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const release = await (prisma as any).featureRelease.findUnique({
    where: { id: params.id },
  }).catch(() => null);
  if (!release) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const VALID_STATUSES = ["active", "beta", "hidden", "archived"];
  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const update: any = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.description !== undefined) update.description = body.description;
  if (body.status !== undefined) update.status = body.status;
  if (body.sortOrder !== undefined) update.sortOrder = Number(body.sortOrder);

  const updated = await (prisma as any).featureRelease.update({
    where: { id: params.id },
    data: update,
  });

  // If status changed, features referencing this release may now be hidden/visible
  if (body.status) invalidateFeatureCache();

  void audit({
    userId: admin.userId,
    action: "release.update" as any,
    targetType: "release",
    targetId: release.releaseId,
    metadata: update,
  });

  return NextResponse.json({ ok: true, release: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const release = await (prisma as any).featureRelease.findUnique({
    where: { id: params.id },
  }).catch(() => null);
  if (!release) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Count features referencing this release
  const featureCount = await (prisma as any).featureControl.count({
    where: { releaseId: release.releaseId },
  }).catch(() => 0);

  if (featureCount > 0) {
    return NextResponse.json({
      error: "release_has_features",
      featureCount,
      detail: "Remove or reassign features before deleting this release",
    }, { status: 409 });
  }

  await (prisma as any).featureRelease.delete({ where: { id: params.id } });

  void audit({
    userId: admin.userId,
    action: "release.delete" as any,
    targetType: "release",
    targetId: release.releaseId,
    metadata: { name: release.name },
  });

  return NextResponse.json({ ok: true });
}
