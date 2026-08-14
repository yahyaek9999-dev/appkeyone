// GET  /api/sms/messages  → delivery log with filters
// POST /api/sms/messages  → manual send (test)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { sendSms } from "@/lib/sms/send";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const SendBody = z.object({
  to: z.string().min(7).max(20),
  body: z.string().min(1).max(1600),
  purpose: z.enum(["order_confirmation", "order_status", "otp", "custom"]).default("custom"),
  customerId: z.string().optional(),
  orderId: z.string().optional(),
});

export async function GET(req: Request) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const purpose = url.searchParams.get("purpose") || undefined;
  const page = Math.max(0, parseInt(url.searchParams.get("page") || "0"));
  const take = 50;

  const [messages, total] = await Promise.all([
    (prisma as any).smsMessage.findMany({
      where: { userId: uid, ...(status ? { status } : {}), ...(purpose ? { purpose } : {}) },
      orderBy: { createdAt: "desc" },
      take,
      skip: page * take,
      select: {
        id: true, to: true, body: true, purpose: true, status: true,
        providerMsgId: true, costUnits: true, segments: true,
        failReason: true, sentAt: true, deliveredAt: true, createdAt: true,
        orderId: true, customerId: true,
        provider: { select: { name: true, type: true } },
      },
    }),
    (prisma as any).smsMessage.count({ where: { userId: uid, ...(status ? { status } : {}) } }),
  ]);

  return NextResponse.json({ ok: true, messages, total, page });
}

export async function POST(req: Request) {
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(req, { name: "sms-send", identifier: uid, ...RATE_LIMITS.api });
  if (limited) return limited;

  const parsed = SendBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body", issues: parsed.error.issues }, { status: 400 });
  const d = parsed.data;

  const result = await sendSms({
    userId: uid,
    to: d.to,
    body: d.body,
    purpose: d.purpose,
    customerId: d.customerId,
    orderId: d.orderId,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
