import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

const Body = z.object({
  brandName: z.string().min(1).max(50),
  brandTagline: z.string().max(200).optional(),
  supportWhatsapp: z.string().min(8).max(20),
  supportEmail: z.string().email(),
  paymentNote: z.string().max(2000).optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const data = parsed.data;
  await prisma.siteConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  return NextResponse.json({ ok: true });
}
