// GET  /api/numbers        → list workspace's WhatsApp numbers
// POST /api/numbers        → create a new number slot (plan-gated)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth";
import { getEntitlements } from "@/lib/membership/entitlements";
import { isFeatureEnabled } from "@/lib/feature-control";

export const dynamic = "force-dynamic";

const CreateBody = z.object({
  displayName: z.string().min(1).max(80),
  phone: z.string().max(20).default(""),
  connectionMethod: z.enum(["bridge", "meta_cloud"]).default("bridge"),
});

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.isOwner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const numbers = await (prisma as any).whatsAppNumber.findMany({
    where: { userId: ctx.user.id },
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: { settings: true },
  });

  return NextResponse.json({ ok: true, numbers, total: numbers.length });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx || !ctx.isOwner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const uid = ctx.user.id;

  // ── Feature control gate (admin kill switch) ──────────────────────────────
  if (!(await isFeatureEnabled("multi_whatsapp", new Set(), uid))) {
    return NextResponse.json({ error: "feature_disabled" }, { status: 403 });
  }

  // ── Plan gate: check number limit ─────────────────────────────────────────
  const ents = await getEntitlements(uid);
  const numberLimit = ents.limits.whatsapp; // 0 = unlimited
  if (numberLimit > 0) {
    const existing = await (prisma as any).whatsAppNumber.count({ where: { userId: uid } });
    if (existing >= numberLimit) {
      return NextResponse.json(
        { error: "number_limit_reached", limit: numberLimit, current: existing },
        { status: 402 },
      );
    }
  }

  const existing = await (prisma as any).whatsAppNumber.count({ where: { userId: uid } });
  const isPrimary = existing === 0; // first number is always primary

  const number = await (prisma as any).whatsAppNumber.create({
    data: {
      userId: uid,
      displayName: parsed.data.displayName,
      phone: parsed.data.phone,
      connectionMethod: parsed.data.connectionMethod,
      status: "inactive",
      isPrimary,
      sortOrder: existing,
    },
  });

  // Create default settings
  await (prisma as any).numberSettings.create({
    data: { numberId: number.id },
  });

  return NextResponse.json({ ok: true, number }, { status: 201 });
}
