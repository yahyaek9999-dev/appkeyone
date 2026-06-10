// Customer 360 — unified activity timeline (read-only, bounded, lazy).
//
// Merges the customer's messages, orders, order-status events, escalations,
// follow-ups and received broadcasts into ONE list sorted newest → oldest.
// Each source query is capped so this stays fast on chatty customers. This is
// intentionally a SEPARATE endpoint from /profile so opening the drawer header
// is instant and the (heavier) timeline streams in after.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Tone = "neutral" | "brand" | "admin" | "success" | "warning" | "danger" | "info";

type TimelineEvent = {
  id: string;
  type:
    | "message"
    | "order"
    | "order_status"
    | "escalation"
    | "follow_up"
    | "broadcast";
  at: string; // ISO
  title: string;
  subtitle?: string | null;
  tone: Tone;
  meta?: Record<string, any>;
};

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  try {
    return JSON.parse(s || "") as T;
  } catch {
    return fallback;
  }
}

function clip(s: string | null | undefined, n = 120): string {
  const v = String(s || "").replace(/\s+/g, " ").trim();
  return v.length > n ? v.slice(0, n) + "…" : v;
}

const ORDER_STATUS_AR: Record<string, string> = {
  pending: "بانتظار التأكيد",
  confirmed: "تم التأكيد",
  preparing: "قيد التجهيز",
  shipped: "تم الشحن",
  out_for_delivery: "خرج للتوصيل",
  delivered: "تم التوصيل",
  canceled: "أُلغي",
};

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const uid = await getUserIdForPermission("customers");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  // Verify ownership + grab the conversation id in one go.
  const customer = await prisma.customer.findFirst({
    where: { id: params.id, userId: uid },
    select: { id: true, conversation: { select: { id: true } } },
  });
  if (!customer) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const convId = customer.conversation?.id || null;

  // Each source is independently bounded so one chatty channel can't blow up
  // the response. They run in parallel and never throw the whole request.
  const [messages, orders, escalations, followUps, broadcastItems] = await Promise.all([
    convId
      ? prisma.message.findMany({
          where: { conversationId: convId },
          orderBy: { createdAt: "desc" },
          take: 60,
          select: { id: true, role: true, content: true, mediaType: true, sentiment: true, createdAt: true },
        }).catch(() => [])
      : Promise.resolve([]),
    prisma.order.findMany({
      where: { userId: uid, customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        items: { take: 3, select: { name: true, quantity: true } },
        timeline: { orderBy: { createdAt: "desc" }, take: 12 },
      },
    }).catch(() => [] as any[]),
    (prisma as any).escalationTicket.findMany({
      where: { userId: uid, customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    }).catch(() => [] as any[]),
    (prisma as any).followUpTask.findMany({
      where: { userId: uid, customerId: customer.id, sentAt: { not: null } },
      orderBy: { sentAt: "desc" },
      take: 25,
    }).catch(() => [] as any[]),
    (prisma as any).broadcastItem.findMany({
      where: { customerId: customer.id, status: "sent" },
      orderBy: { sentAt: "desc" },
      take: 25,
      include: { broadcast: { select: { title: true, kind: true } } },
    }).catch(() => [] as any[]),
  ]);

  const events: TimelineEvent[] = [];

  // ---- Messages ----
  for (const m of messages as any[]) {
    const isUser = m.role === "user";
    const isAdmin = m.role === "admin";
    const isBot = m.role === "assistant";
    if (m.role === "system" || m.role === "tool") continue; // internal — keep timeline human-readable
    events.push({
      id: `msg_${m.id}`,
      type: "message",
      at: new Date(m.createdAt).toISOString(),
      title: m.mediaType && m.mediaType !== "text" ? `[${m.mediaType}] ${clip(m.content, 90)}` : clip(m.content, 120),
      subtitle: isUser ? "العميل" : isAdmin ? "أنت" : isBot ? "البوت" : m.role,
      tone: isUser ? "neutral" : isAdmin ? "admin" : "brand",
      meta: { role: m.role, sentiment: m.sentiment || null },
    });
  }

  // ---- Orders + their status/payment events ----
  for (const o of orders as any[]) {
    const itemNames = (o.items || []).map((it: any) => it.name).filter(Boolean).join("، ");
    events.push({
      id: `order_${o.id}`,
      type: "order",
      at: new Date(o.createdAt).toISOString(),
      title: itemNames ? `طلب: ${clip(itemNames, 90)}` : "طلب جديد",
      subtitle: `${o.total || 0} ${o.currency || "EGP"} · ${ORDER_STATUS_AR[o.status] || o.status}${o.source === "manual" ? " · يدوي" : ""}`,
      tone: o.status === "canceled" ? "danger" : o.status === "delivered" ? "success" : "info",
      meta: { orderId: o.id, status: o.status, total: o.total, paymentMethod: o.paymentMethod || null },
    });
    for (const t of (o.timeline || []) as any[]) {
      // The "created" row duplicates the order event above — skip it.
      if (t.kind === "created") continue;
      const payload = safeParse<Record<string, any>>(t.payload, {});
      const tone: Tone = t.kind === "payment" ? "success" : t.kind === "status_changed" ? "info" : "neutral";
      events.push({
        id: `otl_${t.id}`,
        type: "order_status",
        at: new Date(t.createdAt).toISOString(),
        title: t.message || (t.kind === "status_changed" ? `تغيّر حالة الطلب: ${ORDER_STATUS_AR[payload.to] || payload.to || ""}` : t.kind === "payment" ? "حدث دفع" : t.kind),
        subtitle: itemNames ? clip(itemNames, 60) : null,
        tone,
        meta: { orderId: o.id, kind: t.kind },
      });
    }
  }

  // ---- Escalations (created + resolved) ----
  for (const e of escalations as any[]) {
    events.push({
      id: `esc_${e.id}`,
      type: "escalation",
      at: new Date(e.createdAt).toISOString(),
      title: e.summary || "تصعيد",
      subtitle: `خطورة: ${e.severity}${e.trigger === "manual_admin" ? " · يدوي" : ""}`,
      tone: e.severity === "critical" || e.severity === "high" ? "danger" : "warning",
      meta: { ticketId: e.id, status: e.status, severity: e.severity },
    });
    if (e.resolvedAt) {
      events.push({
        id: `esc_${e.id}_resolved`,
        type: "escalation",
        at: new Date(e.resolvedAt).toISOString(),
        title: "تم حل التصعيد",
        subtitle: e.summary ? clip(e.summary, 60) : null,
        tone: "success",
        meta: { ticketId: e.id, status: "resolved" },
      });
    }
  }

  // ---- Follow-ups (only actually sent ones) ----
  for (const f of followUps as any[]) {
    events.push({
      id: `fup_${f.id}`,
      type: "follow_up",
      at: new Date(f.sentAt).toISOString(),
      title: f.generatedText ? clip(f.generatedText, 110) : "متابعة مُرسلة",
      subtitle: `متابعة${f.status === "converted" ? " · تحوّلت لطلب" : ""}`,
      tone: f.status === "converted" ? "success" : "brand",
      meta: { kind: f.kind, status: f.status },
    });
  }

  // ---- Received broadcasts ----
  for (const b of broadcastItems as any[]) {
    if (!b.sentAt) continue;
    events.push({
      id: `bc_${b.id}`,
      type: "broadcast",
      at: new Date(b.sentAt).toISOString(),
      title: b.broadcast?.title ? `حملة: ${clip(b.broadcast.title, 80)}` : "رسالة جماعية",
      subtitle: b.broadcast?.kind === "recovery" ? "استعادة عميل" : "تسويق",
      tone: "info",
      meta: { broadcastId: b.broadcastId, kind: b.broadcast?.kind || "campaign" },
    });
  }

  // Merge → newest first → cap.
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return NextResponse.json({ events: events.slice(0, 100) });
}
