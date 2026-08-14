/**
 * GET  /api/admin/releases — list all releases
 * POST /api/admin/releases — create a new release
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin as _requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  try {
    const user = await _requireAdmin();
    return { userId: user.id, email: user.email };
  } catch {
    return null;
  }
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const releases = await (prisma as any).featureRelease.findMany({
    orderBy: { sortOrder: "asc" },
  }).catch(() => []);

  // Attach feature count per release
  const allFeatures = await (prisma as any).featureControl.findMany({
    select: { releaseId: true, status: true, featureId: true },
  }).catch(() => []);

  const featuresByRelease = new Map<string, { total: number; enabled: number }>();
  for (const f of allFeatures) {
    if (!f.releaseId) continue;
    const cur = featuresByRelease.get(f.releaseId) || { total: 0, enabled: 0 };
    cur.total++;
    if (f.status === "enabled") cur.enabled++;
    featuresByRelease.set(f.releaseId, cur);
  }

  return NextResponse.json({
    releases: releases.map((r: any) => ({
      ...r,
      features: featuresByRelease.get(r.releaseId) || { total: 0, enabled: 0 },
    })),
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { releaseId, name, description, status, sortOrder } = body;

  if (!releaseId || !name) {
    return NextResponse.json({ error: "releaseId and name required" }, { status: 400 });
  }

  const VALID_STATUSES = ["active", "beta", "hidden", "archived"];
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  try {
    const release = await (prisma as any).featureRelease.create({
      data: {
        releaseId,
        name,
        description: description || "",
        status: status || "hidden",
        sortOrder: sortOrder ?? 99,
      },
    });
    void audit({
      userId: admin.userId,
      action: "release.create" as any,
      targetType: "release",
      targetId: releaseId,
      metadata: { name, status: status || "hidden" },
    });
    return NextResponse.json({ ok: true, release });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "releaseId already exists" }, { status: 409 });
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
}
