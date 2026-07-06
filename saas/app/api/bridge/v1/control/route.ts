// POST /api/bridge/v1/control — Dashboard control of a Bridge (Cloud).
//
// USER-facing. Lets the customer drive the Bridge entirely from the Dashboard:
//   start_qr | reconnect | restart | update | disconnect
// The command is pushed to the customer's Bridge over the live WebSocket by the
// co-located gateway (the Cloud never holds the socket). Scoped to a Bridge the
// caller owns. Gated: 404 when off. (Full device UNLINK is /revoke, not here.)

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, authErrorStatus } from "@/lib/auth";
import { bridgeEnabled } from "@/lib/bridge/flags";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { pushControl, type ControlAction } from "@/lib/bridge/gateway";

export const dynamic = "force-dynamic";

const Body = z.object({
  bridge_id: z.string().min(1).max(64),
  action: z.enum(["start_qr", "reconnect", "restart", "update", "disconnect"]),
});

export async function POST(req: Request) {
  if (!bridgeEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  let user;
  try {
    user = await requirePermission("settings");
  } catch (e) {
    return NextResponse.json({ error: "unauthorized" }, { status: authErrorStatus(e) });
  }

  const limited = enforceRateLimit(req, { name: "bridge-control", ...RATE_LIMITS.api });
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_body", detail: parsed.error.message }, { status: 400 });
  }

  // Ownership check.
  const bridge = await (prisma as any).bridge.findFirst({
    where: { id: parsed.data.bridge_id, userId: user.id, revokedAt: null },
    select: { id: true, status: true },
  });
  if (!bridge) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // For update/start_qr we set a hint immediately so the Dashboard reflects it
  // even before the Bridge acks (the Bridge will overwrite it via `state`).
  if (parsed.data.action === "update") {
    await (prisma as any).bridge.update({ where: { id: bridge.id }, data: { updating: true, lastError: null } });
  }

  const result = await pushControl(user.id, parsed.data.action as ControlAction, { bridgeId: bridge.id });

  if (!result.ok) {
    // Roll back the optimistic hint if we couldn't reach the Bridge.
    if (parsed.data.action === "update") {
      await (prisma as any).bridge.update({ where: { id: bridge.id }, data: { updating: false } }).catch(() => {});
    }
    const msg =
      result.data?.error === "no_bridge_online"
        ? "الجهاز غير متصل حالياً — تأكد أن Bridge يعمل."
        : result.data?.error || "تعذّر إرسال الأمر إلى الجهاز.";
    return NextResponse.json({ ok: false, error: msg }, { status: result.status || 502 });
  }

  return NextResponse.json({ ok: true, action: parsed.data.action });
}
