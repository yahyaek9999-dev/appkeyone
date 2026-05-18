import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { wa } from "@/lib/wa";
import { prisma } from "@/lib/db";

export async function POST() {
  const user = await requireUser();
  await wa.logout(user.id);
  await prisma.bot.update({
    where: { userId: user.id },
    data: { whatsappStatus: "disconnected", whatsappPhone: null },
  });
  return NextResponse.json({ ok: true });
}
