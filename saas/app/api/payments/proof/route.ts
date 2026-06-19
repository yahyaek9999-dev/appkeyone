/** POST/GET /api/payments/proof — customer submits a manual payment proof with a real receipt image. */
import { NextResponse } from "next/server";
import { getUserId, getUserIdForPermission } from "@/lib/auth";
import { createPaymentProof, listPaymentProofs } from "@/lib/payments-ops/proofs";
import { saveProofImage, isAllowedImage, MAX_PROOF_BYTES } from "@/lib/payments-ops/storage";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Billing is owner-only (members never pay) — also a recognized RBAC gate.
  const uid = await getUserIdForPermission("billing");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ctype = req.headers.get("content-type") || "";
  let methodKey = "", planSlug = "", reference = "", proofUrl = "", note = "", accountId = "";
  let amountUsd = 0;
  let proofImagePath = "";

  if (ctype.includes("multipart/form-data")) {
    const form = await req.formData();
    methodKey = String(form.get("methodKey") || "");
    planSlug = String(form.get("planSlug") || "");
    reference = String(form.get("reference") || "");
    proofUrl = String(form.get("proofUrl") || "");
    note = String(form.get("note") || "");
    accountId = String(form.get("accountId") || "");
    amountUsd = Number(form.get("amountUsd") || 0);
    const file = form.get("image");
    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const f = file as File;
      if (!isAllowedImage(f.type)) return NextResponse.json({ error: "bad_image_type", message: "الملف يجب أن يكون صورة (JPG/PNG/WebP)." }, { status: 400 });
      if (f.size > MAX_PROOF_BYTES) return NextResponse.json({ error: "image_too_large", message: "حجم الصورة يجب أن يكون أقل من 8 ميجابايت." }, { status: 400 });
      const bytes = Buffer.from(await f.arrayBuffer());
      proofImagePath = await saveProofImage(f.type, bytes);
    }
  } else {
    let body: any = {};
    try { body = await req.json(); } catch {}
    methodKey = String(body.methodKey || "");
    planSlug = body.planSlug || ""; reference = body.reference || ""; proofUrl = body.proofUrl || "";
    note = body.note || ""; accountId = body.accountId || ""; amountUsd = Number(body.amountUsd || 0);
  }

  if (!methodKey) return NextResponse.json({ error: "methodKey_required" }, { status: 400 });
  // Require real evidence: an uploaded receipt image (or, for backward compat, a URL).
  if (!proofImagePath && !proofUrl) return NextResponse.json({ error: "proof_required", message: "ارفع صورة إيصال الدفع للمتابعة." }, { status: 400 });

  const proof = await createPaymentProof(uid, { methodKey, planSlug, amountUsd, reference, proofUrl, proofImagePath, note, accountId });
  return NextResponse.json({ ok: true, proof });
}

export async function GET() {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, proofs: await listPaymentProofs({ userId: uid, take: 50 }) });
}
