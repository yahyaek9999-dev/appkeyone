import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission, getAuthContext } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";
import { auditCtx } from "@/lib/audit/log";
import { createBroadcastFromSettings, type BroadcastSettings } from "@/lib/broadcasts/create";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const gate = await apiGate("broadcasts");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const bc = await prisma.broadcast.findFirst({
    where: { id: ctx.params.id, userId: uid },
    include: {
      items: {
        orderBy: [{ status: "asc" }, { sentAt: "desc" }],
        take: 200,
      },
    },
  });
  if (!bc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ broadcast: bc });
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const gate = await apiGate("broadcasts");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const action = String(body.action || "");

  const bc = await prisma.broadcast.findFirst({
    where: { id: ctx.params.id, userId: uid },
  });
  if (!bc) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (action === "cancel") {
    if (bc.status === "done" || bc.status === "canceled") {
      return NextResponse.json({ error: "لا يمكن إلغاء حملة منتهية أو ملغاة مسبقاً" }, { status: 400 });
    }
    await prisma.broadcast.update({
      where: { id: bc.id },
      data: { status: "canceled", finishedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  // Pause: the cron's own picker query only looks for status IN
  // (queued, sending), so setting "paused" is sufficient to stop it being
  // picked up — no separate flag needed. Items already sent stay sent;
  // remaining pending items are simply not processed until resumed.
  if (action === "pause") {
    if (bc.status !== "queued" && bc.status !== "sending") {
      return NextResponse.json({ error: "لا يمكن إيقاف حملة بهذه الحالة مؤقتاً" }, { status: 400 });
    }
    const updated = await prisma.broadcast.update({
      where: { id: bc.id },
      data: { status: "paused" } as any,
    });
    return NextResponse.json({ ok: true, broadcast: updated });
  }

  if (action === "resume") {
    if ((bc as any).status !== "paused") {
      return NextResponse.json({ error: "الحملة ليست متوقفة مؤقتاً" }, { status: 400 });
    }
    // Resumes into whichever state it was in before pausing: "sending" if
    // it had already started (some items sent, or startedAt set), else back
    // to "queued" so the cron's normal queued→sending transition re-fires.
    const nextStatus = bc.startedAt ? "sending" : "queued";
    const updated = await prisma.broadcast.update({
      where: { id: bc.id },
      data: { status: nextStatus },
    });
    return NextResponse.json({ ok: true, broadcast: updated });
  }

  // Edit: only while nothing has gone out yet — bc.template/couponCode/
  // imageUrl/scheduledAt are read FRESH from the Broadcast row by the cron
  // on every tick (not snapshotted per-item at creation time), so editing
  // them here takes effect on the next tick with no BroadcastItem changes
  // needed. Audience/recipients are NOT editable post-create (they're
  // already materialized as BroadcastItem rows) — use "duplicate" instead
  // to re-target a fresh audience.
  if (action === "edit") {
    if (bc.status !== "queued" || bc.sent > 0) {
      return NextResponse.json({ error: "لا يمكن التعديل بعد بدء الإرسال" }, { status: 400 });
    }
    const data: any = {};
    if (typeof body.title === "string") data.title = body.title.trim().slice(0, 120) || bc.title;
    if (typeof body.template === "string") {
      const t = body.template.trim();
      if (!t) return NextResponse.json({ error: "نص الرسالة مطلوب" }, { status: 400 });
      data.template = t.slice(0, 4000);
    }
    if (body.couponCode !== undefined) {
      data.couponCode = body.couponCode ? String(body.couponCode).trim().slice(0, 60) : null;
    }
    if (body.imageUrl !== undefined) {
      data.imageUrl =
        typeof body.imageUrl === "string" && /^https?:\/\/\S+$/i.test(body.imageUrl.trim())
          ? body.imageUrl.trim().slice(0, 500)
          : null;
    }
    if (body.scheduledAt !== undefined) {
      if (!body.scheduledAt) {
        data.scheduledAt = null;
      } else {
        const d = new Date(body.scheduledAt);
        if (!isNaN(d.getTime()) && d.getTime() > Date.now() + 30_000) data.scheduledAt = d;
      }
    }
    const updated = await prisma.broadcast.update({ where: { id: bc.id }, data });
    return NextResponse.json({ ok: true, broadcast: updated });
  }

  // Duplicate: same settings, freshly-resolved audience (not a snapshot of
  // who matched last time) — goes through every gate a brand-new campaign
  // would (membership cap, wallet balance), since it's a real new campaign
  // that will really send messages.
  if (action === "duplicate") {
    const settings: BroadcastSettings = {
      title: `${bc.title} (نسخة)`.slice(0, 120),
      template: bc.template,
      audience: bc.audience,
      personalize: bc.personalize,
      couponCode: (bc as any).couponCode || null,
      imageUrl: (bc as any).imageUrl || null,
      scheduledAt: null,
    };
    const result = await createBroadcastFromSettings(uid, settings);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, reason: result.reason, used: result.used, cap: result.cap, balance: result.balance },
        { status: result.status },
      );
    }
    void auditCtx(await getAuthContext(), "broadcast.created", {
      userId: uid,
      targetType: "broadcast",
      targetId: result.broadcast.id,
      metadata: { title: settings.title, audience: settings.audience, recipients: result.broadcast.total, duplicatedFrom: bc.id },
      req,
    });
    return NextResponse.json({ ok: true, broadcast: result.broadcast, skipped: result.skipped });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const gate = await apiGate("broadcasts");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  await prisma.broadcast.deleteMany({
    where: { id: ctx.params.id, userId: uid },
  });
  return NextResponse.json({ ok: true });
}
