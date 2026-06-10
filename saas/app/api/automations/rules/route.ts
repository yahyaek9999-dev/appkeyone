import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  AUTOMATION_TRIGGERS,
  AUTOMATION_ACTIONS,
} from "@/lib/automations/engine";
import { apiGate } from "@/lib/membership/gate";

export const dynamic = "force-dynamic";

// Conditions / actionConfig are stored as JSON strings; we accept loose objects
// and re-serialize so the merchant UI stays simple. Bounded sizes.
const CreateBody = z.object({
  name: z.string().min(1).max(80).default("قاعدة جديدة"),
  triggerType: z.enum(AUTOMATION_TRIGGERS),
  actionType: z.enum(AUTOMATION_ACTIONS),
  conditions: z.record(z.any()).default({}),
  actionConfig: z.record(z.any()).default({}),
  enabled: z.boolean().default(false),
  throttleSeconds: z.number().int().min(0).max(2592000).default(86400),
});

const PatchBody = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  conditions: z.record(z.any()).optional(),
  actionConfig: z.record(z.any()).optional(),
  throttleSeconds: z.number().int().min(0).max(2592000).optional(),
});

function clampJson(obj: unknown): string {
  try {
    return JSON.stringify(obj || {}).slice(0, 4000);
  } catch {
    return "{}";
  }
}

export async function GET() {
  const gate = await apiGate("advanced_automations");
  if (gate.response) return gate.response;
  let user;
  try {
    user = await requirePermission("settings");
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const items = await (prisma as any).automationRule
    .findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 200 })
    .catch(() => []);

  // Recent fire activity (last 7d) for merchant visibility.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = await (prisma as any).automationActionLog
    .findMany({
      where: { userId: user.id, firedAt: { gte: since } },
      orderBy: { firedAt: "desc" },
      take: 50,
    })
    .catch(() => []);

  return NextResponse.json({ ok: true, items, recent });
}

export async function POST(req: Request) {
  const gate = await apiGate("advanced_automations");
  if (gate.response) return gate.response;
  let user;
  try {
    user = await requirePermission("settings");
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limited = enforceRateLimit(req, {
    name: "automation-rule-create",
    identifier: user.id,
    ...RATE_LIMITS.api,
  });
  if (limited) return limited;

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const item = await (prisma as any).automationRule
    .create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        triggerType: parsed.data.triggerType,
        actionType: parsed.data.actionType,
        conditions: clampJson(parsed.data.conditions),
        actionConfig: clampJson(parsed.data.actionConfig),
        enabled: parsed.data.enabled,
        throttleSeconds: parsed.data.throttleSeconds,
      },
    })
    .catch(() => null);

  if (!item) return NextResponse.json({ error: "create_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, item });
}

export async function PATCH(req: Request) {
  const gate = await apiGate("advanced_automations");
  if (gate.response) return gate.response;
  let user;
  try {
    user = await requirePermission("settings");
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limited = enforceRateLimit(req, {
    name: "automation-rule-update",
    identifier: user.id,
    ...RATE_LIMITS.api,
  });
  if (limited) return limited;

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const existing = await (prisma as any).automationRule
    .findFirst({ where: { id: parsed.data.id, userId: user.id }, select: { id: true } })
    .catch(() => null);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const data: any = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled;
  if (parsed.data.throttleSeconds !== undefined) data.throttleSeconds = parsed.data.throttleSeconds;
  if (parsed.data.conditions !== undefined) data.conditions = clampJson(parsed.data.conditions);
  if (parsed.data.actionConfig !== undefined) data.actionConfig = clampJson(parsed.data.actionConfig);

  const item = await (prisma as any).automationRule
    .update({ where: { id: parsed.data.id }, data })
    .catch(() => null);
  if (!item) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, item });
}

export async function DELETE(req: Request) {
  const gate = await apiGate("advanced_automations");
  if (gate.response) return gate.response;
  let user;
  try {
    user = await requirePermission("settings");
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const existing = await (prisma as any).automationRule
    .findFirst({ where: { id, userId: user.id }, select: { id: true } })
    .catch(() => null);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await (prisma as any).automationRule.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
