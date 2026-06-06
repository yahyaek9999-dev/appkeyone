import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiGate } from "@/lib/membership/gate";
import { getAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

const db = prisma as any;

export async function GET(req: Request) {
  const g = await apiGate("approval_workflows");
  if (g.response) return g.response;
  const uid = g.uid!;
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  try {
    const items = await db.approvalRequest.findMany({
      where: { userId: uid, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ ok: true, items });
  } catch {
    return NextResponse.json({ ok: true, items: [], pending: true });
  }
}

export async function POST(req: Request) {
  const g = await apiGate("approval_workflows");
  if (g.response) return g.response;
  const uid = g.uid!;

  let body: any = {};
  try { body = await req.json(); } catch {}
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  let requestedBy = "";
  try {
    const ctx = await getAuthContext();
    requestedBy = ctx?.principalEmail || ctx?.user?.email || "";
  } catch {}

  try {
    const created = await db.approvalRequest.create({
      data: {
        userId: uid,
        targetType: ["broadcast", "order", "coupon", "refund", "custom"].includes(body.targetType)
          ? body.targetType
          : "custom",
        targetId: body.targetId ? String(body.targetId) : null,
        title,
        details: String(body.details || "").trim(),
        amount: typeof body.amount === "number" ? body.amount : null,
        requestedBy,
      },
    });
    return NextResponse.json({ ok: true, item: created });
  } catch {
    return NextResponse.json({ error: "not_ready", pending: true }, { status: 503 });
  }
}
