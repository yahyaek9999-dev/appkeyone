// POST /api/safety/clear-kill — clears the safety kill switch (settings gate).
import { NextResponse } from "next/server";
import { requirePermission, authErrorStatus, getAuthContext } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";
import { clearKillSwitch } from "@/lib/safety/kill-switch";
import { auditCtx } from "@/lib/audit/log";

export async function POST() {
  const gate = await apiGate("safety_controls");
  if (gate.response) return gate.response;
  try {
    const user = await requirePermission("settings");
    await clearKillSwitch(user.id, user.email || "user");
    void auditCtx(await getAuthContext(), "safety.kill_switch_cleared", {
      userId: user.id,
      targetType: "safety",
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: authErrorStatus(e) });
  }
}
