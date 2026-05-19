import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { COMMERCE_CHANNELS, COMMERCE_EVENTS } from "@/lib/commerce/types";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  id: z.string().min(1),
  enabled: z.boolean().optional(),
  subject: z.string().max(200).optional(),
  template: z.string().max(4000).optional(),
  throttleSeconds: z.number().int().min(0).max(86400).optional(),
});

const CreateBody = z.object({
  integrationId: z.string().nullable().optional(),
  eventType: z.enum(COMMERCE_EVENTS),
  channel: z.enum(COMMERCE_CHANNELS),
  language: z.enum(["ar", "en"]).default("ar"),
  enabled: z.boolean().default(false),
  subject: z.string().max(200).optional(),
  template: z.string().max(4000),
  throttleSeconds: z.number().int().min(0).max(86400).default(300),
});

export async function GET() {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const items = await (prisma as any).commerceAutomation.findMany({
    where: { userId: user.id },
    orderBy: [{ eventType: "asc" }, { channel: "asc" }],
  });
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const limited = enforceRateLimit(req, { name: "commerce-automation-create", identifier: user.id, ...RATE_LIMITS.api });
  if (limited) return limited;

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  if (parsed.data.integrationId) {
    const owned = await (prisma as any).commerceIntegration.findFirst({ where: { id: parsed.data.integrationId, userId: user.id }, select: { id: true } });
    if (!owned) return NextResponse.json({ error: "integration_not_found" }, { status: 404 });
  }

  const item = await (prisma as any).commerceAutomation.upsert({
    where: {
      userId_integrationId_eventType_channel_language: {
        userId: user.id,
        integrationId: parsed.data.integrationId || null,
        eventType: parsed.data.eventType,
        channel: parsed.data.channel,
        language: parsed.data.language,
      },
    },
    create: { userId: user.id, ...parsed.data, integrationId: parsed.data.integrationId || null, subject: parsed.data.subject || "" },
    update: {
      enabled: parsed.data.enabled,
      subject: parsed.data.subject || "",
      template: parsed.data.template,
      throttleSeconds: parsed.data.throttleSeconds,
    },
  });

  return NextResponse.json({ ok: true, item });
}

export async function PATCH(req: Request) {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const limited = enforceRateLimit(req, { name: "commerce-automation-update", identifier: user.id, ...RATE_LIMITS.api });
  if (limited) return limited;

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const existing = await (prisma as any).commerceAutomation.findFirst({ where: { id: parsed.data.id, userId: user.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const data: any = {};
  for (const key of ["enabled", "subject", "template", "throttleSeconds"] as const) {
    if (parsed.data[key] !== undefined) data[key] = parsed.data[key];
  }

  const item = await (prisma as any).commerceAutomation.update({ where: { id: parsed.data.id }, data });
  return NextResponse.json({ ok: true, item });
}
