import { NextResponse } from "next/server";
import { requirePermission, authErrorStatus } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const Body = z.object({
  orderExtractionEnabled: z.boolean(),
  orderConfidenceThreshold: z.number().int().min(0).max(100),
  orderRequireProduct: z.boolean(),
  orderRequireConfirmation: z.boolean(),
  businessMode: z.enum(["store", "restaurant", "services", "real_estate", "custom"]),
});

export async function POST(req: Request) {
  try {
    const user = await requirePermission("settings");
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });

    await prisma.bot.update({
      where: { userId: user.id },
      data: parsed.data as any,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: authErrorStatus(e) });
  }
}
