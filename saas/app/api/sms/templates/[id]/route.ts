// PATCH /api/sms/templates/:id  → update
// DELETE /api/sms/templates/:id → delete
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  name: z.string().min(1).max(100).optional(),
  body: z.string().min(1).max(1600).optional(),
  language: z.enum(["ar", "en"]).optional(),
  enabled: z.boolean().optional(),
  variables: z.array(z.string()).optional(),
  statusTrigger: z.string().max(50).optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const gate = await apiGate("k1sms", "settings");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const t = await (prisma as any).smsTemplate.findFirst({ where: { id: params.id, userId: uid } });
  if (!t) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const d = parsed.data;

  const update: any = {};
  if (d.name) update.name = d.name;
  if (d.body) {
    update.body = d.body;
    update.charCount = d.body.length;
    update.segCount = d.body.length <= 160 ? 1 : Math.ceil(d.body.length / 153);
  }
  if (d.language) update.language = d.language;
  if (d.enabled !== undefined) update.enabled = d.enabled;
  if (d.variables) update.variables = JSON.stringify(d.variables);
  if (d.statusTrigger !== undefined) update.statusTrigger = d.statusTrigger;

  const updated = await (prisma as any).smsTemplate.update({ where: { id: t.id }, data: update });
  return NextResponse.json({ ok: true, template: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const gate = await apiGate("k1sms", "settings");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const t = await (prisma as any).smsTemplate.findFirst({ where: { id: params.id, userId: uid } });
  if (!t) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await (prisma as any).smsTemplate.delete({ where: { id: t.id } });
  return NextResponse.json({ ok: true });
}
