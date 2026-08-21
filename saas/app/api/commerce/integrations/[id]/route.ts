import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { COMMERCE_PLATFORMS } from "@/lib/commerce/types";
import { publicIntegration } from "@/lib/commerce/integrations";
import { encryptSecret } from "@/lib/crypto-util";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  platform: z.enum(COMMERCE_PLATFORMS).optional(),
  enabled: z.boolean().optional(),
  configJson: z.record(z.unknown()).optional(),
  storeUrl: z.string().max(300).optional(),
});

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const gate = await apiGate("custom_integrations", "settings");
  if (gate.response) return gate.response;
  let user;
  try { user = await requirePermission("settings"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const integration = await (prisma as any).commerceIntegration.findFirst({
    where: { id: ctx.params.id, userId: user.id },
    include: { automations: true, _count: { select: { events: true, orders: true } } },
  });
  if (!integration) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    integration: { ...publicIntegration(integration, new URL(req.url).origin), counts: integration._count },
    automations: integration.automations,
  });
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const gate = await apiGate("custom_integrations", "settings");
  if (gate.response) return gate.response;
  let user;
  try { user = await requirePermission("settings"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const limited = enforceRateLimit(req, { name: "commerce-integration-update", identifier: user.id, ...RATE_LIMITS.api });
  if (limited) return limited;

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const existing = await (prisma as any).commerceIntegration.findFirst({ where: { id: ctx.params.id, userId: user.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const data: any = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (parsed.data.platform !== undefined) data.platform = parsed.data.platform;
  if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled;
  if (parsed.data.storeUrl !== undefined) {
    data.storeUrl = parsed.data.storeUrl.trim().replace(/\/$/, "") || null;
    data.connectionStatus = "untested";
  }
  if (parsed.data.configJson !== undefined) {
    // Store store credentials (accessToken / consumerKey+Secret / storeId) AES-256-GCM
    // encrypted at rest — read back via readIntegrationConfig() in the sync engine.
    data.configJson = encryptSecret(JSON.stringify(parsed.data.configJson).slice(0, 10000));
    data.connectionStatus = "untested";
  }

  const updated = await (prisma as any).commerceIntegration.update({ where: { id: ctx.params.id }, data });
  return NextResponse.json({ ok: true, integration: publicIntegration(updated, new URL(req.url).origin) });
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const gate = await apiGate("custom_integrations", "settings");
  if (gate.response) return gate.response;
  let user;
  try { user = await requirePermission("settings"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const existing = await (prisma as any).commerceIntegration.findFirst({
    where: { id: ctx.params.id, userId: user.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Delete cascades: automations and webhook events are scoped to the integration.
  // We delete in order to avoid FK violations (events → automations → integration).
  await (prisma as any).commerceWebhookEvent.deleteMany({ where: { integrationId: ctx.params.id } });
  await (prisma as any).commerceAutomation.deleteMany({ where: { integrationId: ctx.params.id } });
  await (prisma as any).commerceIntegration.delete({ where: { id: ctx.params.id } });

  return NextResponse.json({ ok: true, deleted: true });
}
