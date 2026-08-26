// GET  /api/admin/feature-control  → list all feature controls
// POST /api/admin/feature-control  → seed defaults or bulk update
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getAllFeatures, seedFeatureRegistry, upsertFeature } from "@/lib/feature-control";
import { z } from "zod";
import { FEATURE_STATUSES } from "@/lib/feature-status";

export const dynamic = "force-dynamic";

const BulkBody = z.object({
  action: z.enum(["seed"]).optional(),
  feature: z.object({
    featureId: z.string(),
    status: z.enum(FEATURE_STATUSES).optional(),
    customerVisible: z.boolean().optional(),
    killSwitch: z.boolean().optional(),
    beta: z.boolean().optional(),
    rolloutPct: z.number().int().min(0).max(100).optional(),
    requiredPlan: z.string().optional().nullable(),
    releaseId: z.string().optional().nullable(),
    changeNote: z.string().max(200).optional(),
  }).optional(),
});

export async function GET(_req: Request) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const features = await getAllFeatures();
  return NextResponse.json({ ok: true, features, total: features.length });
}

export async function POST(req: Request) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const parsed = BulkBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const d = parsed.data;

  if (d.action === "seed") {
    const { features: seeded, releases } = await seedFeatureRegistry();
    const all = await getAllFeatures();
    return NextResponse.json({ ok: true, seeded, releases, total: all.length });
  }

  if (d.feature) {
    const { featureId, changeNote, ...rest } = d.feature;
    const updated = await upsertFeature(featureId, rest as any, admin.email);
    return NextResponse.json({ ok: true, feature: updated });
  }

  return NextResponse.json({ error: "no_action" }, { status: 400 });
}
