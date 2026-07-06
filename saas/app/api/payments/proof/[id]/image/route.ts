/**
 * GET /api/payments/proof/[id]/image — serve a payment-proof receipt image.
 * Private: only the proof's owner (the paying customer) or a finance/admin
 * reviewer may view it. Images live outside the public web root.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { getFinanceActor } from "@/lib/finance/access";
import { readProofImage } from "@/lib/payments-ops/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const proof = await prisma.paymentProof.findUnique({ where: { id: String(params.id || "") }, select: { userId: true, proofImagePath: true } });
  if (!proof || !proof.proofImagePath) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const uid = await getUserId();
  const isOwnerOfProof = uid && uid === proof.userId;
  const reviewer = isOwnerOfProof ? null : await getFinanceActor();
  if (!isOwnerOfProof && !reviewer) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const img = await readProofImage(proof.proofImagePath);
  if (!img) return NextResponse.json({ error: "image_missing" }, { status: 404 });
  return new NextResponse(img.bytes as any, {
    status: 200,
    headers: { "Content-Type": img.contentType, "Cache-Control": "private, no-store" },
  });
}
