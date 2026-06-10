import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await apiGate("working_hours");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const bot = await prisma.bot.findUnique({ where: { userId: uid } });
  if (!bot) return NextResponse.json({ error: "no_bot" }, { status: 400 });

  let slots: any[] = [];
  try { slots = JSON.parse((bot as any).workingHours || "[]"); } catch {}
  return NextResponse.json({
    enabled: (bot as any).workingHoursEnabled,
    slots,
    outOfHoursMessage: (bot as any).outOfHoursMessage || "",
    alertEnabled: (bot as any).alertEnabled ?? true,
    followUpsEnabled: (bot as any).followUpsEnabled ?? true,
    followUpHours: (bot as any).followUpHours ?? 24,
    dailyReportEnabled: (bot as any).dailyReportEnabled ?? true,
    dailyReportHour: (bot as any).dailyReportHour ?? 9,
    timezone: (bot as any).timezone || "Africa/Cairo",
  });
}

export async function POST(req: Request) {
  const gate = await apiGate("working_hours");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}

  const data: any = {};
  if (typeof body.enabled === "boolean") data.workingHoursEnabled = body.enabled;
  if (Array.isArray(body.slots)) {
    data.workingHours = JSON.stringify(
      body.slots.map((s: any) => ({
        day: Math.max(0, Math.min(6, Number(s.day) | 0)),
        from: String(s.from || "09:00"),
        to: String(s.to || "21:00"),
        enabled: !!s.enabled,
      }))
    );
  }
  if (typeof body.outOfHoursMessage === "string") {
    data.outOfHoursMessage = body.outOfHoursMessage.trim();
  }
  if (typeof body.alertEnabled === "boolean") data.alertEnabled = body.alertEnabled;
  if (typeof body.followUpsEnabled === "boolean") data.followUpsEnabled = body.followUpsEnabled;
  if (typeof body.followUpHours === "number") {
    data.followUpHours = Math.max(1, Math.min(168, body.followUpHours | 0));
  }
  if (typeof body.dailyReportEnabled === "boolean") {
    data.dailyReportEnabled = body.dailyReportEnabled;
  }
  if (typeof body.dailyReportHour === "number") {
    data.dailyReportHour = Math.max(0, Math.min(23, body.dailyReportHour | 0));
  }
  if (typeof body.timezone === "string" && body.timezone.trim()) {
    // Validate the IANA name; ignore silently if bogus.
    const tz = body.timezone.trim().slice(0, 64);
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
      data.timezone = tz;
    } catch {/* invalid tz — keep current value */}
  }

  await prisma.bot.update({ where: { userId: uid }, data });
  return NextResponse.json({ ok: true });
}
