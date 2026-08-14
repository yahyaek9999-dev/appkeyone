// PATCH /api/admin/feature-control/:id → update a single feature flag
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { upsertFeature } from "@/lib/feature-control";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  status: z.enum(["enabled", "disabled", "hidden", "beta", "deprecated"]).optional(),
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
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body", issues: parsed.error.issues }, { status: 400 });

  const updated = await upsertFeature(params.id, parsed.data as any, ctx.principalEmail);
  return NextResponse.json({ ok: true, feature: updated });
}
