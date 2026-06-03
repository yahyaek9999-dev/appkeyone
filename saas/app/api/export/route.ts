import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserForPermission } from "@/lib/auth";
import { type Permission } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  type: z.enum(["customers", "orders", "broadcasts", "conversations"]),
  format: z.enum(["csv"]),
});

// Each export type requires the permission that governs that data domain.
const EXPORT_PERMISSION: Record<z.infer<typeof QuerySchema>["type"], Permission> = {
  customers: "customers",
  orders: "customers",
  broadcasts: "broadcasts",
  conversations: "inbox",
};

function toCsvRow(values: (string | number | null | undefined)[]): string {
  return values
    .map((v) => {
      const s = v == null ? "" : String(v).replace(/\r\n/g, " ").replace(/\n/g, " ");
      return `"${s.replace(/"/g, '""')}"`;
    })
    .join(",");
}

function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [toCsvRow(headers), ...rows.map(toCsvRow)].join("\r\n");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    type: searchParams.get("type"),
    format: searchParams.get("format") || "csv",
  });
  if (!parsed.success) return NextResponse.json({ error: "bad_params" }, { status: 400 });

  const { type } = parsed.data; // format is always "csv" — reserved for future xlsx

  // RBAC: require the permission that owns this data domain. Owner passes all;
  // a viewer/support member without it gets 403 (no data leak).
  const user = await getUserForPermission(EXPORT_PERMISSION[type]);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let csvContent = "";
  let filename = "";

  if (type === "customers") {
    const rows = await prisma.customer.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10000,
      select: { name: true, phone: true, leadScore: true, tags: true, lastSeenAt: true, createdAt: true },
    });
    csvContent = buildCsv(
      ["الاسم", "الهاتف", "درجة العميل", "التاجز", "آخر نشاط", "تاريخ الإضافة"],
      rows.map(r => [r.name, r.phone, r.leadScore, r.tags, r.lastSeenAt?.toISOString(), r.createdAt.toISOString()]),
    );
    filename = "customers";
  } else if (type === "orders") {
    const rows = await prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10000,
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        status: true,
        total: true,
        paymentMethod: true,
        trackingCode: true,
        createdAt: true,
      },
    });
    csvContent = buildCsv(
      ["معرّف الطلب", "اسم العميل", "هاتف العميل", "الحالة", "الإجمالي", "طريقة الدفع", "كود الشحن", "تاريخ الطلب"],
      rows.map(r => [r.id, r.customerName, r.customerPhone, r.status, r.total, r.paymentMethod, r.trackingCode, r.createdAt.toISOString()]),
    );
    filename = "orders";
  } else if (type === "broadcasts") {
    const rows = await prisma.broadcast.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: { id: true, title: true, audience: true, status: true, sent: true, failed: true, total: true, createdAt: true },
    });
    csvContent = buildCsv(
      ["عنوان", "الجمهور", "الحالة", "المُرسَل", "الفاشل", "الإجمالي", "تاريخ الإنشاء"],
      rows.map(r => [r.title, r.audience, r.status, r.sent ?? 0, r.failed ?? 0, r.total ?? 0, r.createdAt.toISOString()]),
    );
    filename = "broadcasts";
  } else if (type === "conversations") {
    const rows = await prisma.message.findMany({
      where: { conversation: { customer: { userId: user.id } } },
      orderBy: { createdAt: "desc" },
      take: 50000,
      select: {
        role: true,
        content: true,
        intent: true,
        sentiment: true,
        createdAt: true,
        conversation: { select: { customer: { select: { name: true, phone: true } } } },
      },
    });
    csvContent = buildCsv(
      ["العميل", "الهاتف", "الدور", "الرسالة", "النية", "المشاعر", "التاريخ"],
      rows.map(r => [
        r.conversation.customer.name, r.conversation.customer.phone,
        r.role, r.content, r.intent, r.sentiment, r.createdAt.toISOString(),
      ]),
    );
    filename = "conversations";
  }

  const date = new Date().toISOString().slice(0, 10);
  const headers = new Headers({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="keyone_${filename}_${date}.csv"`,
  });

  // UTF-8 BOM for Excel compatibility with Arabic
  const bom = "﻿";
  return new Response(bom + csvContent, { headers });
}
