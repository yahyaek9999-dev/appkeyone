// Lost-Customer Recovery — actions.
//
// send_now / schedule → create a single-recipient Broadcast (kind:"recovery").
//   This deliberately reuses the EXISTING broadcast pipeline so the message
//   drains through the same protected outgoing queue (pacing / anti-flood /
//   cooldown / protection). There is NO direct send here — nothing bypasses
//   the safety layer.
// dismiss → persist a RecoveryDismissal so the candidate stops resurfacing.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { checkLimit, incrementUsage } from "@/lib/membership/limits";
import { apiGate } from "@/lib/membership/gate";

export const dynamic = "force-dynamic";

function isReachable(ph: string | null | undefined): boolean {
  const v = (ph || "").trim();
  if (!v || v.startsWith("lid:") || v.includes("@lid")) return false;
  const digits = v.replace(/^\+/, "").replace(/[^\d]/g, "");
  return digits.length >= 8 && digits.length <= 13;
}

export async function POST(req: Request) {
  const gate = await apiGate("smart_campaign_builder");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const action = String(body.action || "");
  const customerId = String(body.customerId || "");
  const kind = String(body.kind || "lost_customer");
  if (!customerId) {
    return NextResponse.json({ error: "customerId مطلوب" }, { status: 400 });
  }

  // ---- Dismiss ----
  if (action === "dismiss") {
    await prisma.recoveryDismissal.upsert({
      where: { userId_customerId_kind: { userId: uid, customerId, kind } },
      create: { userId: uid, customerId, kind },
      update: {},
    });
    return NextResponse.json({ ok: true, dismissed: true });
  }

  // ---- Send now / Schedule ----
  if (action === "send_now" || action === "schedule") {
    const message = String(body.message || "").trim();
    if (!message) {
      return NextResponse.json({ error: "نص الرسالة مطلوب" }, { status: 400 });
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, userId: uid },
      select: { id: true, phone: true, name: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "العميل غير موجود" }, { status: 404 });
    }
    if (!isReachable(customer.phone)) {
      return NextResponse.json(
        { error: "رقم العميل غير قابل للمراسلة (معرّف واتساب فقط)" },
        { status: 400 },
      );
    }

    // Same membership gate as broadcasts — recovery sends count against the cap.
    const decision = await checkLimit(uid, "broadcast");
    if (!decision.allowed) {
      return NextResponse.json(
        { error: "الإرسال غير متاح في باقتك الحالية أو استُنفد الحد", reason: decision.reason },
        { status: 403 },
      );
    }

    let scheduledAt: Date | null = null;
    if (action === "schedule" && body.scheduledAt) {
      const d = new Date(body.scheduledAt);
      if (!isNaN(d.getTime()) && d.getTime() > Date.now() + 30_000) scheduledAt = d;
    }

    const bc = await prisma.broadcast.create({
      data: {
        userId: uid,
        title: customer.name ? `استعادة: ${customer.name}` : "استعادة عميل",
        template: message.slice(0, 4000),
        audience: "recovery",
        personalize: false,
        kind: "recovery",
        scheduledAt,
        total: 1,
        items: {
          create: [{ customerId: customer.id, phone: customer.phone, name: customer.name }],
        },
      } as any,
    });

    await incrementUsage(uid, "broadcast", 1);

    // Auto-dismiss the recovery suggestion once acted on, so it doesn't linger.
    await prisma.recoveryDismissal
      .upsert({
        where: { userId_customerId_kind: { userId: uid, customerId, kind } },
        create: { userId: uid, customerId, kind },
        update: {},
      })
      .catch(() => {});

    return NextResponse.json({ ok: true, broadcastId: bc.id, scheduled: !!scheduledAt });
  }

  return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
}
