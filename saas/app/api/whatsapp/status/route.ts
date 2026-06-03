import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { wa } from "@/lib/wa";
import { prisma } from "@/lib/db";
import { recordMilestone } from "@/lib/activation/track";

export async function GET() {
  try {
    const user = await requireUser();
    const r = await wa.status(user.id);
    if (!r.ok) {
      return NextResponse.json({ status: "service_unreachable", qr: null, phone: null });
    }
    const data = r.data as { status: string; qr: string | null; pairingCode: string | null; phone: string | null };

    // Sync DB state
    if (data.status === "connected" && user.bot?.whatsappStatus !== "connected") {
      await prisma.bot.update({
        where: { userId: user.id },
        data: { whatsappStatus: "connected", whatsappPhone: data.phone || undefined },
      });
      // Activation funnel: WhatsApp linked. This is a status SYNC route (read of
      // the service's session state), not the send pipeline — safe to emit here.
      recordMilestone(user.id, "whatsapp_connected").catch(() => {});
    } else if (data.status === "disconnected" && user.bot?.whatsappStatus !== "disconnected") {
      await prisma.bot.update({
        where: { userId: user.id },
        data: { whatsappStatus: "disconnected", whatsappPhone: null },
      });
    }
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.message === "UNAUTHORIZED" ? 401 : 500 });
  }
}
