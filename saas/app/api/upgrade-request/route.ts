import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getEffectivePlan } from "@/lib/membership/plan";
import { getTier, TIER_ORDER } from "@/lib/pricing/catalog";

export const dynamic = "force-dynamic";

const db = prisma as any;

/** Merchant views their own latest upgrade request. */
export async function GET() {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  try {
    const latest = await db.upgradeRequest.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ ok: true, request: latest || null });
  } catch {
    return NextResponse.json({ ok: true, request: null, pending: true });
  }
}

/** Merchant requests an upgrade to a target plan (admin activates later). */
export async function POST(req: Request) {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const toSlug = String(body.toSlug || "").trim();
  if (!TIER_ORDER.includes(toSlug as any)) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }
  const billingCycle = body.billingCycle === "yearly" ? "yearly" : "monthly";

  let fromSlug = "";
  try { fromSlug = (await getEffectivePlan(user.id)).slug; } catch {}

  try {
    // Avoid stacking duplicate pending requests — reuse the open one if present.
    const open = await db.upgradeRequest.findFirst({
      where: { userId: user.id, status: "pending" },
    });
    if (open) {
      await db.upgradeRequest.update({
        where: { id: open.id },
        data: { toSlug, billingCycle, fromSlug, note: body.note ? String(body.note).trim() : null },
      });
      return NextResponse.json({ ok: true, reused: true });
    }
    await db.upgradeRequest.create({
      data: {
        userId: user.id,
        fromSlug,
        toSlug,
        billingCycle,
        note: body.note ? String(body.note).trim() : null,
        contactPhone: body.contactPhone ? String(body.contactPhone).trim() : null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_ready", pending: true }, { status: 503 });
  }
}
