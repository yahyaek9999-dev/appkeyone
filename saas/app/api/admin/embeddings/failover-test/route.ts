// POST /api/admin/embeddings/failover-test  { text? } — run the failover engine
// and return the full attempt trace (proof of automatic failover).
import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { embedQueryFailover } from "@/lib/embeddings/providers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
  }
  const body = await req.json().catch(() => ({}));
  const text = (body?.text || "اختبار محرك التضمين").toString().slice(0, 500);
  const result = await embedQueryFailover(text);
  // result already carries { ok, provider?, dims?, kind?, trace }
  return NextResponse.json(result);
}
