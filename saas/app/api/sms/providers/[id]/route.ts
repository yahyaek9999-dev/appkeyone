// PATCH /api/sms/providers/:id  → update provider
// DELETE /api/sms/providers/:id → delete
// POST   /api/sms/providers/:id/test → test connection
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";
import { encryptSecret, decryptSecret } from "@/lib/crypto-util";
import { getAdapter } from "@/lib/sms/adapters";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  apiKey: z.string().max(500).optional(),
  apiSecret: z.string().max(500).optional(),
  senderId: z.string().max(20).optional(),
  endpoint: z.string().url().optional().or(z.literal("")),
  action: z.enum(["test"]).optional(),
});

async function getProvider(id: string, uid: string) {
  return (prisma as any).smsProvider.findFirst({ where: { id, userId: uid } });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const gate = await apiGate("k1sms", "settings");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const p = await getProvider(params.id, uid);
  if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const d = parsed.data;

  // Handle test action
  if (d.action === "test") {
    const dec = (v: string | null | undefined) => { try { return v ? decryptSecret(v) : null; } catch { return null; } };
    const creds = { apiKey: dec(p.apiKeyEnc), apiSecret: dec(p.apiSecretEnc), senderId: dec(p.senderIdEnc), endpoint: p.endpoint };
    const adapter = getAdapter(p.type);
    const result = await adapter.test(creds);
    await (prisma as any).smsProvider.update({
      where: { id: p.id },
      data: { lastTestAt: new Date(), lastTestOk: result.ok, health: result.ok ? "healthy" : "degraded" },
    });
    return NextResponse.json({ ok: result.ok, detail: result.detail });
  }

  const enc = (v?: string) => (v?.trim() ? encryptSecret(v.trim()) : undefined);
  const update: any = {};
  if (d.name) update.name = d.name;
  if (d.enabled !== undefined) update.enabled = d.enabled;
  if (d.endpoint !== undefined) update.endpoint = d.endpoint?.trim() || null;
  if (d.apiKey !== undefined) update.apiKeyEnc = enc(d.apiKey) ?? null;
  if (d.apiSecret !== undefined) update.apiSecretEnc = enc(d.apiSecret) ?? null;
  if (d.senderId !== undefined) update.senderIdEnc = enc(d.senderId) ?? null;
  if (d.isDefault !== undefined) {
    update.isDefault = d.isDefault;
    if (d.isDefault) {
      await (prisma as any).smsProvider.updateMany({ where: { userId: uid, id: { not: p.id } }, data: { isDefault: false } });
    }
  }

  const updated = await (prisma as any).smsProvider.update({
    where: { id: p.id },
    data: update,
    select: { id: true, name: true, type: true, enabled: true, isDefault: true, health: true },
  });
  return NextResponse.json({ ok: true, provider: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const gate = await apiGate("k1sms", "settings");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const p = await getProvider(params.id, uid);
  if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await (prisma as any).smsProvider.delete({ where: { id: p.id } });
  return NextResponse.json({ ok: true });
}
