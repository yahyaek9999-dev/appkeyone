// GET /api/knowledge/semantic-search?q=...  — vector + hybrid search.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { semanticSearch } from "@/lib/knowledge-brain/search";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ ok: true, query: "", rewritten: "", hits: [], scanned: 0 });
  const result = await semanticSearch(uid, q);
  return NextResponse.json({ ok: true, ...result });
}
