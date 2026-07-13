/**
 * Merge two duplicate Customer records into one. See lib/customers/merge.ts
 * for the full model-by-model strategy.
 *
 * POST /api/customers/merge { survivorId, absorbedId } → { ok, movedCounts }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserIdForPermission, getAuthContext } from "@/lib/auth";
import { auditCtx } from "@/lib/audit/log";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { mergeCustomers, MergeError } from "@/lib/customers/merge";

export const dynamic = "force-dynamic";

const Body = z.object({
  survivorId: z.string().min(1),
  absorbedId: z.string().min(1),
});

export async function POST(req: Request) {
  const uid = await getUserIdForPermission("customers");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const limited = enforceRateLimit(req, { name: "customer-merge", identifier: uid, ...RATE_LIMITS.api });
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  try {
    const result = await mergeCustomers(prisma, {
      userId: uid,
      survivorId: parsed.data.survivorId,
      absorbedId: parsed.data.absorbedId,
    });

    void auditCtx(await getAuthContext(), "customer.merged", {
      userId: uid,
      targetType: "customer",
      targetId: result.survivorId,
      metadata: { absorbedId: result.absorbedId, movedCounts: result.movedCounts },
      req,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    if (e instanceof MergeError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[customers/merge] failed:", e?.message || e);
    return NextResponse.json({ error: "فشل الدمج" }, { status: 500 });
  }
}
