/**
 * POST /api/admin/brain/marketplace/[key] — enable/disable/price a Brain
 * marketplace listing (Phase 9). Admin-only.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { setMarketplaceListing } from "@/lib/brain/marketplace";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { key: string } }) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  const key = String(params.key || "");
  if (!key) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  let body: any = {};
  try { body = await req.json(); } catch {}
  const updated = await setMarketplaceListing(key, {
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    priceUsd: body.priceUsd != null ? Number(body.priceUsd) : undefined,
  }).catch(() => null);
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, listing: updated });
}
