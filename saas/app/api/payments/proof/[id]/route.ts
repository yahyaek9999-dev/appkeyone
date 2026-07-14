/**
 * POST /api/payments/proof/[id] — customer actions on their own proof (owner-only, billing gate):
 *   action=cancel    → cancel a still-pending/under-review proof (JSON)
 *   action=resubmit  → re-upload a receipt for a rejected proof, back to pending (multipart)
 * Closes the "rejected customer is stuck forever" trust gap.
 */
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { cancelProof, resubmitProof } from "@/lib/payments-ops/proofs";
import { saveProofImage, MAX_PROOF_BYTES } from "@/lib/payments-ops/storage";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { sniffBinaryType } from "@/lib/upload-validate";

export const dynamic = "force-dynamic";

const ALLOWED_PROOF_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const uid = await getUserIdForPermission("billing");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(req, { name: "payment-proof-upload", identifier: uid, ...RATE_LIMITS.api });
  if (limited) return limited;

  const id = String(params.id || "");
  const ctype = req.headers.get("content-type") || "";

  if (ctype.includes("multipart/form-data")) {
    const form = await req.formData();
    const action = String(form.get("action") || "");
    if (action !== "resubmit") return NextResponse.json({ error: "bad_action" }, { status: 400 });
    let proofImagePath = "";
    const file = form.get("image");
    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const f = file as File;
      if (f.size > MAX_PROOF_BYTES) return NextResponse.json({ error: "image_too_large", message: "حجم الصورة أكبر من 8 ميجابايت." }, { status: 400 });
      const bytes = Buffer.from(await f.arrayBuffer());
      const sniffed = sniffBinaryType(bytes);
      if (!sniffed || !ALLOWED_PROOF_TYPES.has(sniffed)) {
        return NextResponse.json({ error: "bad_image_type", message: "الملف يجب أن يكون صورة." }, { status: 400 });
      }
      proofImagePath = await saveProofImage(sniffed, bytes);
    }
    const proofUrl = String(form.get("proofUrl") || "");
    if (!proofImagePath && !proofUrl) return NextResponse.json({ error: "proof_required", message: "ارفع صورة إيصال جديدة." }, { status: 400 });
    return NextResponse.json(await resubmitProof(uid, id, { proofImagePath, proofUrl, reference: String(form.get("reference") || "") || undefined }));
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  if (body.action === "cancel") return NextResponse.json(await cancelProof(uid, id));
  return NextResponse.json({ error: "bad_action" }, { status: 400 });
}
