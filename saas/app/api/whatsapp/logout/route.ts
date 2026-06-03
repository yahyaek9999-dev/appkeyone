import { NextResponse } from "next/server";
import { requirePermission, authErrorStatus, getAuthContext } from "@/lib/auth";
import { wa } from "@/lib/wa";
import { prisma } from "@/lib/db";
import { auditCtx } from "@/lib/audit/log";

export async function POST() {
  try {
    const user = await requirePermission("settings");
    await wa.logout(user.id);
    await prisma.bot.update({
      where: { userId: user.id },
      data: { whatsappStatus: "disconnected", whatsappPhone: null },
    });
    void auditCtx(await getAuthContext(), "whatsapp.disconnected", {
      userId: user.id,
      targetType: "bot",
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: authErrorStatus(e) });
  }
}
