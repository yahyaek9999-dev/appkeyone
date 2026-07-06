// GET /api/arena/conversations — recent simulated conversations + transcripts.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { listConversations } from "@/lib/arena/simulator";
import { SCENARIO_CATEGORIES } from "@/lib/arena/scenarios";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const conversations = await listConversations(uid);
  return NextResponse.json({ ok: true, conversations, categories: SCENARIO_CATEGORIES });
}
