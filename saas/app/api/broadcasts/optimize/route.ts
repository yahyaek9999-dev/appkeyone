// Advanced Broadcast AI — campaign optimization suggestions.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { optimizeCampaign } from "@/lib/broadcasts/ai-optimize";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  // AI cost guard — rate-limit optimization (LLM-backed) per workspace.
  const limited = enforceRateLimit(req, { name: "broadcast-optimize", identifier: uid, ...RATE_LIMITS.chat });
  if (limited) return limited;

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  try {
    const data = await optimizeCampaign(uid, {
      template: String(body.template || "").slice(0, 2000),
      audience: String(body.audience || "all"),
      product: body.product ? String(body.product).slice(0, 160) : undefined,
      offer: body.offer ? String(body.offer).slice(0, 160) : undefined,
    });
    return NextResponse.json({ ok: true, ...data });
  } catch (e: any) {
    return NextResponse.json({ error: "optimize_failed", detail: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
