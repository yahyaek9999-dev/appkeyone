// Meta incident center (admin). GET → list (filter by status/userId).
// POST { action: "resolve"|"ack"|"escalate", id, note? }.
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { listIncidents, resolveIncident, acknowledgeIncident, escalateIncident } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const userId = url.searchParams.get("userId") || undefined;
  const incidents = await listIncidents({ status, userId, take: 200 });
  return NextResponse.json({ ok: true, incidents });
}

const Body = z.object({
  action: z.enum(["resolve", "ack", "escalate"]),
  id: z.string().min(1),
  note: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const { action, id, note } = parsed.data;
  const res =
    action === "resolve"
      ? await resolveIncident(id, admin.email, note)
      : action === "ack"
        ? await acknowledgeIncident(id, admin.email)
        : await escalateIncident(id, admin.email);
  if (!res.ok)
    return NextResponse.json(
      { error: res.reason },
      { status: res.reason === "not_found" ? 404 : 409 },
    );
  return NextResponse.json(res);
}
