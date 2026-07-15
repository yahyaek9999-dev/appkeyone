// Meta provider registry (admin). GET → registered providers; with ?userId,
// also returns that tenant's per-provider health + the failover selection.
import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { listProviders, getProviderHealth, resolveActiveProvider } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
  }
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") || undefined;
  if (userId) {
    const [health, active] = await Promise.all([
      getProviderHealth(userId),
      resolveActiveProvider(userId),
    ]);
    return NextResponse.json({ ok: true, providers: listProviders(), health, active });
  }
  return NextResponse.json({ ok: true, providers: listProviders() });
}
