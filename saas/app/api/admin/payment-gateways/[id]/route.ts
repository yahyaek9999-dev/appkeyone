/**
 * Admin: single payment gateway operations.
 *   GET    /api/admin/payment-gateways/[id]         — get gateway (credentials masked)
 *   PATCH  /api/admin/payment-gateways/[id]         — update name/credentials/settings
 *   DELETE /api/admin/payment-gateways/[id]         — remove gateway
 *   POST   /api/admin/payment-gateways/[id]/test    — handled in /test/route.ts
 *   POST   /api/admin/payment-gateways/[id]/default — set as default
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit/log";
import { encryptSecret } from "@/lib/crypto-util";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

function maskGateway(gw: any) {
  const { credentialsEnc, webhookSecretEnc, ...rest } = gw;
  return {
    ...rest,
    hasCredentials: Boolean(credentialsEnc),
    hasWebhookSecret: Boolean(webhookSecretEnc),
  };
}

export async function GET(_req: Request, ctx: Ctx) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const gw = await (prisma as any).paymentGateway.findUnique({ where: { id: ctx.params.id } }).catch(() => null);
  if (!gw) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, gateway: maskGateway(gw) });
}

export async function PATCH(req: Request, ctx: Ctx) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const gw = await (prisma as any).paymentGateway.findUnique({ where: { id: ctx.params.id } }).catch(() => null);
  if (!gw) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: any = {};
  try { body = await req.json(); } catch {}

  const updates: any = { updatedAt: new Date() };

  if (body.name !== undefined)     updates.name     = String(body.name).trim();
  if (body.testMode !== undefined) updates.testMode = Boolean(body.testMode);
  if (body.isDefault !== undefined) updates.isDefault = Boolean(body.isDefault);
  if (body.isFallback !== undefined) updates.isFallback = Boolean(body.isFallback);

  if (body.credentials) {
    updates.credentialsEnc = encryptSecret(JSON.stringify(body.credentials));
  }
  if (body.webhookSecret) {
    updates.webhookSecretEnc = encryptSecret(String(body.webhookSecret));
  }
  if (body.currencies !== undefined) {
    try { updates.currencies = JSON.stringify(JSON.parse(body.currencies)); } catch {}
  }
  if (body.methods !== undefined) {
    try { updates.methods = JSON.stringify(JSON.parse(body.methods)); } catch {}
  }

  // If setting as default, unset all others
  if (updates.isDefault) {
    await (prisma as any).paymentGateway.updateMany({ data: { isDefault: false } }).catch(() => {});
  }

  const updated = await (prisma as any).paymentGateway.update({ where: { id: ctx.params.id }, data: updates });

  await audit({
    userId: admin?.id || "admin",
    action: "admin.payment_gateway_updated",
    actorId: admin?.id || null,
    actorEmail: admin?.email || "admin",
    actorRole: "admin",
    targetType: "PaymentGateway",
    targetId: ctx.params.id,
    metadata: { updatedFields: Object.keys(updates).filter(k => k !== "updatedAt") },
    req,
  });

  return NextResponse.json({ ok: true, gateway: maskGateway(updated) });
}

export async function DELETE(req: Request, ctx: Ctx) {
  let admin: any;
  try { admin = await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const gw = await (prisma as any).paymentGateway.findUnique({ where: { id: ctx.params.id } }).catch(() => null);
  if (!gw) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (gw.isDefault) return NextResponse.json({ error: "cannot_delete_default", hint: "set another gateway as default first" }, { status: 409 });

  await (prisma as any).paymentGateway.delete({ where: { id: ctx.params.id } });

  await audit({
    userId: admin?.id || "admin",
    action: "admin.payment_gateway_removed",
    actorId: admin?.id || null,
    actorEmail: admin?.email || "admin",
    actorRole: "admin",
    targetType: "PaymentGateway",
    targetId: ctx.params.id,
    metadata: { adapter: gw.adapter, name: gw.name },
    req,
  });

  return NextResponse.json({ ok: true, deleted: true });
}
