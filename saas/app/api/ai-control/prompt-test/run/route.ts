// POST /api/ai-control/prompt-test/run  { promptVersionId?, message }
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserIdForPermission } from "@/lib/auth";
import { runPromptTest } from "@/lib/ai-control/prompt-test";

export const dynamic = "force-dynamic";

const Body = z.object({
  promptVersionId: z.string().max(60).optional(),
  message: z.string().min(1).max(500),
});

export async function POST(req: Request) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const res = await runPromptTest(uid, parsed.data.promptVersionId || "", parsed.data.message);
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
  return NextResponse.json(res);
}
