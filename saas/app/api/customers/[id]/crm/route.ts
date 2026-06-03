// Customer 360 — CRM admin controls (write path).
//
// One consolidated, action-switched mutation endpoint (mirrors the shape of
// /api/recovery/action). Every action is strictly scoped to the signed-in
// user's own customer. The heavier flows reuse battle-tested helpers instead
// of reimplementing them:
//   - escalate     → createEscalationTicket() (same path the AI uses)
//   - follow-up    → handled by the frontend via /api/recovery/action, which
//                    drains through the protected outgoing/broadcast queue.
// Tag / note / VIP / blacklist / assign / archive are plain additive field
// edits on the Customer row. manual_order creates a real Order (source:manual)
// so it shows up everywhere orders already do.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { createEscalationTicket } from "@/lib/escalation";

export const dynamic = "force-dynamic";

function parseTags(s: string | null | undefined): string[] {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const uid = await getUserIdForPermission("customers");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  const action = String(body.action || "");

  // Ownership gate — every action below operates on THIS customer only.
  const customer: any = await prisma.customer.findFirst({
    where: { id: params.id, userId: uid },
  });
  if (!customer) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    switch (action) {
      // ---- Notes ----
      case "set_note": {
        const notes = String(body.notes ?? "").slice(0, 4000);
        await prisma.customer.update({ where: { id: customer.id }, data: { notes } as any });
        return NextResponse.json({ ok: true, notes });
      }

      // ---- Tags ----
      case "add_tag": {
        const tag = String(body.tag || "").trim().slice(0, 40);
        if (!tag) return NextResponse.json({ error: "tag مطلوب" }, { status: 400 });
        const tags = parseTags(customer.tags);
        if (!tags.includes(tag)) tags.push(tag);
        await prisma.customer.update({ where: { id: customer.id }, data: { tags: JSON.stringify(tags) } as any });
        return NextResponse.json({ ok: true, tags });
      }
      case "remove_tag": {
        const tag = String(body.tag || "").trim();
        const tags = parseTags(customer.tags).filter((t) => t !== tag);
        await prisma.customer.update({ where: { id: customer.id }, data: { tags: JSON.stringify(tags) } as any });
        return NextResponse.json({ ok: true, tags });
      }

      // ---- Flags ----
      case "set_vip": {
        const vip = !!body.value;
        await prisma.customer.update({ where: { id: customer.id }, data: { vip } as any });
        return NextResponse.json({ ok: true, vip });
      }
      case "set_blacklist": {
        const blacklisted = !!body.value;
        await prisma.customer.update({ where: { id: customer.id }, data: { blacklisted } as any });
        return NextResponse.json({ ok: true, blacklisted });
      }
      case "assign": {
        const raw = String(body.assignedAdmin ?? "").trim().slice(0, 80);
        const assignedAdmin = raw || null;
        await prisma.customer.update({ where: { id: customer.id }, data: { assignedAdmin } as any });
        return NextResponse.json({ ok: true, assignedAdmin });
      }
      case "archive":
      case "unarchive": {
        const archivedAt = action === "archive" ? new Date() : null;
        await prisma.customer.update({ where: { id: customer.id }, data: { archivedAt } as any });
        return NextResponse.json({ ok: true, archivedAt });
      }

      // ---- Force escalation (reuse the AI's own escalation path) ----
      case "escalate": {
        const conv: any = await prisma.conversation.findUnique({
          where: { customerId: customer.id },
          select: { id: true },
        });
        if (!conv) return NextResponse.json({ error: "لا توجد محادثة لهذا العميل" }, { status: 400 });

        const note = String(body.note || "").trim();
        const messageText = note || "تصعيد يدوي من الإدارة — يحتاج تدخل بشري.";
        const result = await createEscalationTicket({
          userId: uid,
          customerId: customer.id,
          conversationId: conv.id,
          customerPhone: customer.phone,
          customerName: customer.name,
          messageText,
          analysis: {
            intent: "escalation",
            sentiment: (customer.lastSentiment as any) || "neutral",
            angerScore: customer.frustrationScore || 0,
            frustrationScore: customer.frustrationScore || 0,
            urgencyScore: 60,
            confidenceScore: 100,
            frustrationLoop: false,
            shouldEscalate: true,
            shouldCalmFirst: false,
            severity: "high",
            trigger: "manual_admin",
            reasons: ["تصعيد يدوي من الإدارة"],
            toneHint: "",
          },
        });
        return NextResponse.json({ ok: true, ticketId: result?.ticket?.id || null });
      }

      // ---- Manual order ----
      case "manual_order": {
        const rawItems = Array.isArray(body.items) ? body.items : [];
        const items = rawItems
          .map((it: any) => {
            const name = String(it?.name || "").trim().slice(0, 200);
            const quantity = Math.max(1, Math.min(9999, Math.round(Number(it?.quantity) || 1)));
            const unitPrice = Math.max(0, Math.round(Number(it?.unitPrice) || 0));
            return name ? { name, quantity, unitPrice, lineTotal: quantity * unitPrice } : null;
          })
          .filter(Boolean) as { name: string; quantity: number; unitPrice: number; lineTotal: number }[];

        if (items.length === 0) {
          return NextResponse.json({ error: "أضف منتج واحد على الأقل" }, { status: 400 });
        }

        const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
        const shipping = Math.max(0, Math.round(Number(body.shipping) || 0));
        const discount = Math.max(0, Math.round(Number(body.discount) || 0));
        const total = Math.max(0, subtotal + shipping - discount);
        const paymentMethod = body.paymentMethod ? String(body.paymentMethod).slice(0, 40) : null;
        const shippingAddress = body.shippingAddress ? String(body.shippingAddress).slice(0, 500) : null;

        const conv: any = await prisma.conversation
          .findUnique({ where: { customerId: customer.id }, select: { id: true } })
          .catch(() => null);

        const order: any = await prisma.order.create({
          data: {
            userId: uid,
            customerId: customer.id,
            conversationId: conv?.id || null,
            customerName: customer.name,
            customerPhone: customer.phone,
            shippingAddress,
            subtotal,
            shipping,
            discount,
            total,
            currency: "EGP",
            paymentMethod,
            status: "pending",
            fulfillmentStatus: "unfulfilled",
            aiConfidence: 100,
            source: "manual",
            items: { create: items },
            timeline: {
              create: [{ kind: "created", message: "تم إنشاء الطلب يدوياً من ملف العميل." }],
            },
          } as any,
        });

        return NextResponse.json({ ok: true, orderId: order.id, total });
      }

      default:
        return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: "تعذّر تنفيذ الإجراء", detail: String(e?.message || e).slice(0, 200) },
      { status: 500 },
    );
  }
}
