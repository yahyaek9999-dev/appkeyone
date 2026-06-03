import { NextResponse } from "next/server";
import { requirePermission, authErrorStatus, getAuthContext } from "@/lib/auth";
import { wa } from "@/lib/wa";
import { prisma } from "@/lib/db";
import { auditCtx } from "@/lib/audit/log";

export async function POST() {
  try {
    const user = await requirePermission("settings");
    const r = await wa.start(user.id);
    if (!r.ok) {
      return NextResponse.json(
        { error: "خدمة الواتساب غير متاحة. تأكد من تشغيل whatsapp-service على بورت 3001." },
        { status: 503 }
      );
    }
    await prisma.bot.update({
      where: { userId: user.id },
      data: { whatsappStatus: "connecting" },
    });
    void auditCtx(await getAuthContext(), "whatsapp.connected", {
      userId: user.id,
      targetType: "bot",
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: authErrorStatus(e) });
  }
}
