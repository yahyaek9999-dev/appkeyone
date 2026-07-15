import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

const db = prisma as any;

/** List upgrade requests (default: pending). */
export async function GET(req: Request) {
  try { await requireAdmin(); }
  catch (e) { return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) }); }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "pending";
  try {
    const items = await db.upgradeRequest.findMany({
      where: status === "all" ? {} : { status },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    // Attach user email + plan name for the admin table.
    const userIds = Array.from(new Set(items.map((i: any) => i.userId))) as string[];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, name: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const enriched = items.map((i: any) => ({ ...i, user: byId.get(i.userId) || null }));
    return NextResponse.json({ ok: true, items: enriched });
  } catch {
    return NextResponse.json({ ok: true, items: [], pending: true });
  }
}

/**
 * Activate or reject an upgrade request.
 * Activating: sets the user's Subscription to the target plan (creates one if
 * missing) with status "active" and a 30/365-day expiry, then marks the
 * request "activated". This is the manual-activation flow — payment is
 * reconciled out-of-band (no processor wired yet).
 */
export async function POST(req: Request) {
  let admin;
  try { admin = await requireAdmin(); }
  catch (e) { return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) }); }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const id = String(body.id || "");
  const action = body.action; // "activate" | "reject"
  if (!id || !["activate", "reject"].includes(action)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const reqRow = await db.upgradeRequest.findUnique({ where: { id } });
    if (!reqRow) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const handledBy = (admin as any)?.email || "admin";

    if (action === "reject") {
      await db.upgradeRequest.update({
        where: { id },
        data: { status: "rejected", handledBy, handledAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }

    // Activate: resolve the target plan row.
    const plan = await prisma.plan.findUnique({ where: { slug: reqRow.toSlug } });
    if (!plan) return NextResponse.json({ error: "plan_not_found" }, { status: 404 });

    const now = new Date();
    // Millisecond arithmetic, not setMonth()/setFullYear() — setMonth on a
    // 29-31-day month tail (e.g. activating Jan 31) overflows into the wrong
    // month (Mar 3 instead of Feb 28/29), silently granting extra free days.
    // Matches the pattern already used in app/api/admin/subscriptions/route.ts.
    const expires = new Date(
      now.getTime() + (reqRow.billingCycle === "yearly" ? 365 : 30) * 24 * 60 * 60 * 1000,
    );

    // Upsert the subscription to the target plan (additive; resets monthly usage).
    await prisma.subscription.upsert({
      where: { userId: reqRow.userId },
      update: {
        planId: plan.id,
        status: "active",
        billingCycle: reqRow.billingCycle,
        startedAt: now,
        expiresAt: expires,
        msgsUsed: 0,
        aiRequestsUsed: 0,
        broadcastsUsed: 0,
        usageResetAt: now,
      } as any,
      create: {
        userId: reqRow.userId,
        planId: plan.id,
        status: "active",
        billingCycle: reqRow.billingCycle,
        startedAt: now,
        expiresAt: expires,
        usageResetAt: now,
      } as any,
    });

    await db.upgradeRequest.update({
      where: { id },
      data: { status: "activated", handledBy, handledAt: new Date() },
    });

    return NextResponse.json({ ok: true, activated: plan.slug });
  } catch (e: any) {
    return NextResponse.json({ error: "activation_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
