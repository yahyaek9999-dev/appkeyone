// Meta health engine trigger (admin). POST { userId? } → one tenant, else a
// full sweep of all provisioned tenants. Opens/auto-resolves incidents.
import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { runHealthCheck, runHealthSweep } from "@/lib/meta";

export const dynamic = "force-dynamic";

const Body = z.object({ userId: z.string().optional() });

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const userId = parsed.success ? parsed.data.userId : undefined;
  const res = userId ? await runHealthCheck(userId) : await runHealthSweep();
  return NextResponse.json({ ok: true, scope: userId ? "tenant" : "sweep", ...res });
}
