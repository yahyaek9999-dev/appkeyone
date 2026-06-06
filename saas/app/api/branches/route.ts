import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiGate } from "@/lib/membership/gate";

export const dynamic = "force-dynamic";

const db = prisma as any;

export async function GET() {
  const g = await apiGate("multi_branch");
  if (g.response) return g.response;
  const uid = g.uid!;
  try {
    const items = await db.branch.findMany({
      where: { userId: uid },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ ok: true, items });
  } catch {
    return NextResponse.json({ ok: true, items: [], pending: true });
  }
}

export async function POST(req: Request) {
  const g = await apiGate("multi_branch");
  if (g.response) return g.response;
  const uid = g.uid!;

  let body: any = {};
  try { body = await req.json(); } catch {}
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  try {
    // First branch becomes the default automatically.
    const count = await db.branch.count({ where: { userId: uid } });
    const created = await db.branch.create({
      data: {
        userId: uid,
        name,
        code: String(body.code || "").trim(),
        phone: body.phone ? String(body.phone).trim() : null,
        address: body.address ? String(body.address).trim() : null,
        city: body.city ? String(body.city).trim() : null,
        managerName: body.managerName ? String(body.managerName).trim() : null,
        isDefault: count === 0,
      },
    });
    return NextResponse.json({ ok: true, item: created });
  } catch {
    return NextResponse.json({ error: "not_ready", pending: true }, { status: 503 });
  }
}
