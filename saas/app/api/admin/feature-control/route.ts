// GET  /api/admin/feature-control  → list all feature controls
// POST /api/admin/feature-control  → seed defaults or bulk update
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { getAllFeatures, seedDefaultFeatureControls, upsertFeature } from "@/lib/feature-control";
import { z } from "zod";

export const dynamic = "force-dynamic";

const BulkBody = z.object({
  action: z.enum(["seed"]).optional(),
  feature: z.object({
    featureId: z.string(),
    status: z.enum(["enabled", "disabled", "hidden", "beta", "deprecated"]).optional(),
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
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const features = await getAllFeatures();
  return NextResponse.json({ ok: true, features, total: features.length });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = BulkBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const d = parsed.data;

  if (d.action === "seed") {
    await seedDefaultFeatureControls();
    const features = await getAllFeatures();
    return NextResponse.json({ ok: true, seeded: features.length });
  }

  if (d.feature) {
    const { featureId, changeNote, ...rest } = d.feature;
    const updated = await upsertFeature(featureId, rest as any, ctx.principalEmail);
    return NextResponse.json({ ok: true, feature: updated });
  }

  return NextResponse.json({ error: "no_action" }, { status: 400 });
}
