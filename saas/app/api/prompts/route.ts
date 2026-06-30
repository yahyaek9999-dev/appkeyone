// GET /api/prompts — list versions.  POST /api/prompts — create a draft.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserIdForPermission } from "@/lib/auth";
import { listVersions, createVersion } from "@/lib/prompts/manager";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const versions = await listVersions(uid);
  return NextResponse.json({ ok: true, versions });
}

const Body = z.object({
  title: z.string().max(120).optional(),
  body: z.string().min(10).max(8000),
});

export async function POST(req: Request) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const v = await createVersion(uid, parsed.data.title || "", parsed.data.body);
  return NextResponse.json({ ok: true, version: v });
}
