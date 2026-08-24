// GET  /api/conv-flows   → list flows for tenant
// POST /api/conv-flows   → create a flow
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const TRIGGER_TYPES = ["message_in", "keyword", "button_tap", "order_event", "manual"] as const;

const CreateBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(300).default(""),
  trigger: z.enum(TRIGGER_TYPES).default("message_in"),
  triggerConfig: z.record(z.any()).default({}),
  isDefault: z.boolean().default(false),
});

export async function GET(req: Request) {
  // flow_builder is a Growth (tier 1) capability. The pages were gated but
  // this API was not, so any Start-tier tenant could create flows — which now
  // actually execute via the incoming-message pipeline. Gate at the data boundary.
  const gate = await apiGate("flow_builder", "settings");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const status = new URL(req.url).searchParams.get("status") || undefined;
  const flows = await (prisma as any).convFlow.findMany({
    where: { userId: uid, ...(status ? { status } : {}) },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true, name: true, description: true, trigger: true,
      status: true, version: true, execCount: true, completions: true,
      handoffs: true, isDefault: true, createdAt: true, updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, flows });
}

export async function POST(req: Request) {
  // flow_builder is a Growth (tier 1) capability. The pages were gated but
  // this API was not, so any Start-tier tenant could create flows — which now
  // actually execute via the incoming-message pipeline. Gate at the data boundary.
  const gate = await apiGate("flow_builder", "settings");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(req, { name: "conv-flow-create", identifier: uid, ...RATE_LIMITS.api });
  if (limited) return limited;

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body", issues: parsed.error.issues }, { status: 400 });
  const d = parsed.data;

  if (d.isDefault) {
    await (prisma as any).convFlow.updateMany({ where: { userId: uid }, data: { isDefault: false } });
  }

  const flow = await (prisma as any).convFlow.create({
    data: {
      userId: uid,
      name: d.name,
      description: d.description,
      trigger: d.trigger,
      triggerConfig: JSON.stringify(d.triggerConfig),
      isDefault: d.isDefault,
      nodesJson: JSON.stringify(getStarterNodes(d.name)),
      edgesJson: "[]",
    },
    select: { id: true, name: true, trigger: true, status: true },
  });

  return NextResponse.json({ ok: true, flow });
}

/** Create a starter "start" node for a new flow. */
function getStarterNodes(name: string) {
  return [
    {
      id: "start",
      type: "start",
      position: { x: 200, y: 100 },
      data: { label: "البداية", description: `بداية: ${name}` },
    },
  ];
}
