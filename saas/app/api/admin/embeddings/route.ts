// GET /api/admin/embeddings — providers + stats for the Embedding Admin Center.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getEmbeddingCenter } from "@/lib/embeddings/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  const data = await getEmbeddingCenter();
  return NextResponse.json({ ok: true, ...data });
}
