/**
 * GET /api/wallet/ledger — paginated wallet transactions (history). Owner-only.
 * Query: ?take=25&cursor=<id>&kind=<kind>
 */
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { listLedger } from "@/lib/wallet/wallet";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const uid = await getUserIdForPermission("billing");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const take = parseInt(url.searchParams.get("take") || "25", 10);
  const cursor = url.searchParams.get("cursor") || undefined;
  const kind = url.searchParams.get("kind") || undefined;

  try {
    const { items, nextCursor } = await listLedger(uid, { take, cursor, kind });
    return NextResponse.json({ ok: true, items, nextCursor });
  } catch (e: any) {
    return NextResponse.json({ error: "ledger_unavailable", detail: String(e?.message || e) }, { status: 500 });
  }
}
