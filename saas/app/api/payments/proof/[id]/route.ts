/** POST /api/payments/proof/[id] — customer cancels their own pending proof (trust). Owner-only (billing). */
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { cancelProof } from "@/lib/payments-ops/proofs";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const uid = await getUserIdForPermission("billing");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch {}
  if (body.action !== "cancel") return NextResponse.json({ error: "bad_action" }, { status: 400 });
  return NextResponse.json(await cancelProof(uid, String(params.id || "")));
}
