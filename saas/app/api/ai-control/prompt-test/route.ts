// GET /api/ai-control/prompt-test — tests + versions + comparison + rollback.
import { NextResponse } from "next/server";
import { getUserIdForPermission } from "@/lib/auth";
import { getPromptTests } from "@/lib/ai-control/prompt-test";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const data = await getPromptTests(uid);
  return NextResponse.json({ ok: true, ...data });
}
