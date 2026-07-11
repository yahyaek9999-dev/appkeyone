import { NextResponse } from "next/server";
import { requirePermission, authErrorStatus } from "@/lib/auth";
import { wa } from "@/lib/wa";

export async function POST(req: Request) {
  try {
    const user = await requirePermission("settings");
    const { phone } = await req.json();
    if (!phone) return NextResponse.json({ error: "رقم الهاتف مطلوب" }, { status: 400 });

    // Bridge tenants link from the Bridge page — see whatsapp/start guard.
    try {
      const { bridgeEnabled } = await import("@/lib/bridge/flags");
      const { normalizeConnectionMode } = await import("@/lib/messaging/mode");
      const { prisma } = await import("@/lib/db");
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

    // Make sure session is started first
    await wa.start(user.id);
    // Tiny delay to allow socket init
    await new Promise((r) => setTimeout(r, 1000));
    const r = await wa.pair(user.id, phone);
    if (!r.ok) {
      return NextResponse.json({ error: r.data?.error || "تعذر إنشاء كود الربط" }, { status: 503 });
    }
    return NextResponse.json({ ok: true, code: r.data.code });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: authErrorStatus(e) });
  }
}
