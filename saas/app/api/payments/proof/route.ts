/** POST/GET /api/payments/proof — customer submits a manual payment proof (Phase 1). */
import { NextResponse } from "next/server";
import { getUserId, getUserIdForPermission } from "@/lib/auth";
import { createPaymentProof, listPaymentProofs } from "@/lib/payments-ops/proofs";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Billing is owner-only (members never pay) — also a recognized RBAC gate.
  const uid = await getUserIdForPermission("billing");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch {}
  if (!body.methodKey) return NextResponse.json({ error: "methodKey_required" }, { status: 400 });
  const proof = await createPaymentProof(uid, {
    methodKey: String(body.methodKey), planSlug: body.planSlug, amountUsd: Number(body.amountUsd || 0),
    reference: body.reference, proofUrl: body.proofUrl, note: body.note, accountId: body.accountId,
  });
  return NextResponse.json({ ok: true, proof });
}

export async function GET() {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, proofs: await listPaymentProofs({ userId: uid, take: 50 }) });
}
