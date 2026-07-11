import { NextResponse } from "next/server";
import { requirePermission, authErrorStatus, getAuthContext } from "@/lib/auth";
import { wa } from "@/lib/wa";
import { prisma } from "@/lib/db";
import { auditCtx } from "@/lib/audit/log";

export async function POST() {
  try {
    const user = await requirePermission("settings");

    // Bridge tenants link from the Bridge page — starting a SECOND session in
    // the co-located wa-service would create a competing WhatsApp device and
    // confuse the status views. Additive guard; qr/meta tenants unaffected.
    try {
      const { bridgeEnabled } = await import("@/lib/bridge/flags");
      const { normalizeConnectionMode } = await import("@/lib/messaging/mode");
      const bot = await prisma.bot.findUnique({
        where: { userId: user.id },
        select: { connectionMode: true } as any,
      });
      if (bridgeEnabled() && normalizeConnectionMode((bot as any)?.connectionMode) === "bridge") {
        return NextResponse.json(
          { error: "حسابك مربوط عبر KEYONE Bridge — اربط واتساب من صفحة Bridge في الإعدادات.", mode: "bridge" },
          { status: 409 },
        );
      }
    } catch { /* additive guard only */ }

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
