// Conversation Semantic Memory search — GET /api/customers/[id]/memory-search?q=...
//
// Merchant-facing, human-driven read-only search over a customer's past memory
// snapshots (see lib/intelligence/conversation-memory.ts). Deliberately NOT
// wired into any AI reply/context-builder path — this is a search tool for a
// human agent looking things up, not an automated context injection, so it
// carries zero risk to the WhatsApp send pipeline.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { searchConversationMemory } from "@/lib/intelligence/conversation-memory";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const uid = await getUserIdForPermission("customers");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const q = (new URL(req.url).searchParams.get("q") || "").slice(0, 300);
  if (q.trim().length < 2) return NextResponse.json({ ok: true, hits: [] });

  try {
    const hits = await searchConversationMemory(uid, params.id, q, 5);
    return NextResponse.json({ ok: true, hits });
  } catch {
    return NextResponse.json({ ok: true, hits: [] });
  }
}
