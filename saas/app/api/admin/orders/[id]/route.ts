import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

const ORDER_STATUSES = ["pending","confirmed","preparing","shipped","out_for_delivery","delivered","canceled","refunded"] as const;

const PatchBody = z.object({
  status: z.enum(ORDER_STATUSES),
  notes: z.string().optional(),
});

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const { status, notes } = parsed.data;
  const order = await prisma.order.findUnique({ where: { id: params.id } });
  if (!order) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });

  const updated = await prisma.order.update({
    where: { id: params.id },
    data: { status },
  });

  if (notes) {
    await prisma.orderTimeline.create({
      data: {
        orderId: params.id,
        kind: "admin_update",
        message: notes,
      } as any,
    });
  }

  return NextResponse.json({ ok: true, order: updated });
}
