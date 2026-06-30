// POST /api/admin/embeddings/[type]/test — test a provider connection.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { testProvider, type ProviderType } from "@/lib/embeddings/providers";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { type: string } }) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  if (!["local", "openai", "gemini"].includes(params.type))
    return NextResponse.json({ error: "bad_type" }, { status: 400 });
  const result = await testProvider(params.type as ProviderType);
  return NextResponse.json({ ok: true, result });
}
