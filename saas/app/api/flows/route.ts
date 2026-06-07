import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiGate } from "@/lib/membership/gate";

export const dynamic = "force-dynamic";

const db = prisma as any;

export async function GET() {
  const g = await apiGate("flow_builder", "settings");
  if (g.response) return g.response;
  const uid = g.uid!;
  try {
    const items = await db.flowDefinition.findMany({
      where: { userId: uid },
      orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }],
    });
    return NextResponse.json({ ok: true, items });
  } catch {
    // Table not migrated yet on this environment — return empty, never 500.
    return NextResponse.json({ ok: true, items: [], pending: true });
  }
}

export async function POST(req: Request) {
  const g = await apiGate("flow_builder", "settings");
  if (g.response) return g.response;
  const uid = g.uid!;

  let body: any = {};
  try { body = await req.json(); } catch {}
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  try {
    const created = await db.flowDefinition.create({
      data: {
        userId: uid,
        name,
        description: String(body.description || "").trim(),
        trigger: ["message_received", "keyword", "order_created", "manual"].includes(body.trigger)
          ? body.trigger
          : "message_received",
        enabled: body.enabled === true,
        graphJson: typeof body.graphJson === "string" ? body.graphJson : '{"nodes":[],"edges":[]}',
      },
    });
    return NextResponse.json({ ok: true, item: created });
  } catch {
    return NextResponse.json({ error: "not_ready", pending: true }, { status: 503 });
  }
}
