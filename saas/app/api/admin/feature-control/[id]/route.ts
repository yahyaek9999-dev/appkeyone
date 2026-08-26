// PATCH /api/admin/feature-control/:id → update a single feature flag
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { upsertFeature, getAllFeatures } from "@/lib/feature-control";
import { audit } from "@/lib/audit/log";
import { FEATURE_STATUSES } from "@/lib/feature-status";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  status: z.enum(FEATURE_STATUSES).optional(),
  customerVisible: z.boolean().optional(),
  adminOnly: z.boolean().optional(),
  beta: z.boolean().optional(),
  killSwitch: z.boolean().optional(),
  rolloutPct: z.number().int().min(0).max(100).optional(),
  requiredPlan: z.string().optional().nullable(),
  releaseId: z.string().optional().nullable(),
  changeNote: z.string().max(200).optional(),
  name: z.string().max(100).optional(),
  description: z.string().max(300).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body", issues: parsed.error.issues }, { status: 400 });

  // Capture BEFORE state for the changed keys so the audit row carries a diff.
  const beforeRow = (await getAllFeatures().catch(() => [])).find((f) => f.featureId === params.id) || null;
  const changedKeys = Object.keys(parsed.data);
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const k of changedKeys) {
    if (beforeRow) before[k] = (beforeRow as any)[k];
    after[k] = (parsed.data as any)[k];
  }

  const updated = await upsertFeature(params.id, parsed.data as any, admin.email);

  // Audit 2.0 — sensitive feature-control mutation with before/after diff.
  void audit({
    userId: admin.id,
    actorId: admin.id,
    actorEmail: admin.email ?? null,
    actorRole: "admin",
    action: "admin.feature.update" as any,
    targetType: "feature",
    targetId: params.id,
    metadata: { before, after, changeNote: (parsed.data as any).changeNote ?? null },
    req,
  }).catch(() => {});

  return NextResponse.json({ ok: true, feature: updated });
}
