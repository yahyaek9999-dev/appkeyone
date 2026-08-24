// GET    /api/conv-flows/:id  → full flow with nodes + edges
// PATCH  /api/conv-flows/:id  → update (nodes, status, name, etc.)
// DELETE /api/conv-flows/:id  → archive flow
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(300).optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
  isDefault: z.boolean().optional(),
  trigger: z.string().optional(),
  triggerConfig: z.record(z.any()).optional(),
  nodes: z.array(z.any()).optional(),
  edges: z.array(z.any()).optional(),
});

async function getFlow(id: string, uid: string) {
  return (prisma as any).convFlow.findFirst({ where: { id, userId: uid } });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  // flow_builder is a Growth (tier 1) capability. The pages were gated but
  // this API was not, so any Start-tier tenant could create flows — which now
  // actually execute via the incoming-message pipeline. Gate at the data boundary.
  const gate = await apiGate("flow_builder", "settings");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const flow = await getFlow(params.id, uid);
  if (!flow) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let nodes: any[] = [];
  let edges: any[] = [];
  let triggerConfig: any = {};
  try { nodes = JSON.parse(flow.nodesJson || "[]"); } catch {}
  try { edges = JSON.parse(flow.edgesJson || "[]"); } catch {}
  try { triggerConfig = JSON.parse(flow.triggerConfig || "{}"); } catch {}

  return NextResponse.json({ ok: true, flow: { ...flow, nodes, edges, triggerConfig } });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  // flow_builder is a Growth (tier 1) capability. The pages were gated but
  // this API was not, so any Start-tier tenant could create flows — which now
  // actually execute via the incoming-message pipeline. Gate at the data boundary.
  const gate = await apiGate("flow_builder", "settings");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const flow = await getFlow(params.id, uid);
  if (!flow) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const d = parsed.data;

  if (d.isDefault && d.isDefault !== flow.isDefault) {
    await (prisma as any).convFlow.updateMany({ where: { userId: uid, id: { not: flow.id } }, data: { isDefault: false } });
  }

  const update: any = {};
  if (d.name) update.name = d.name;
  if (d.description !== undefined) update.description = d.description;
  if (d.status) update.status = d.status;
  if (d.isDefault !== undefined) update.isDefault = d.isDefault;
  if (d.trigger) update.trigger = d.trigger;
  if (d.triggerConfig) update.triggerConfig = JSON.stringify(d.triggerConfig);
  if (d.nodes) {
    update.nodesJson = JSON.stringify(d.nodes).slice(0, 65_000);
    update.version = flow.version + 1;
  }
  if (d.edges) {
    update.edgesJson = JSON.stringify(d.edges).slice(0, 32_000);
  }

  const updated = await (prisma as any).convFlow.update({ where: { id: flow.id }, data: update });
  return NextResponse.json({ ok: true, flow: { id: updated.id, status: updated.status, version: updated.version } });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  // flow_builder is a Growth (tier 1) capability. The pages were gated but
  // this API was not, so any Start-tier tenant could create flows — which now
  // actually execute via the incoming-message pipeline. Gate at the data boundary.
  const gate = await apiGate("flow_builder", "settings");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const flow = await getFlow(params.id, uid);
  if (!flow) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Archive instead of hard-delete — preserve execution history
  await (prisma as any).convFlow.update({ where: { id: flow.id }, data: { status: "archived" } });
  return NextResponse.json({ ok: true });
}
