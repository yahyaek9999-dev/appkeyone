// POST /api/safety/clear-kill — admin clears the kill switch.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { clearKillSwitch } from "@/lib/safety/kill-switch";

export async function POST() {
  const user = await requireUser();
  await clearKillSwitch(user.id, user.email || "user");
  return NextResponse.json({ ok: true });
}
