// GET /api/arena/optimize — queue + history.  POST — queue a job { type }.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserIdForPermission } from "@/lib/auth";
import { listJobs, queueJob, OPT_TYPES } from "@/lib/arena/optimize";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const data = await listJobs(uid);
  return NextResponse.json({ ok: true, ...data, types: OPT_TYPES });
}

const Body = z.object({ type: z.enum(["knowledge", "faq", "quick_reply", "brain", "prompt"]) });

export async function POST(req: Request) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const job = await queueJob(uid, parsed.data.type);
  return NextResponse.json({ ok: true, job });
}
