import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, getAuthContext } from "@/lib/auth";
import { auditCtx } from "@/lib/audit/log";
import { recordMilestone } from "@/lib/activation/track";

const Body = z.object({
  name: z.string().min(1).max(100),
  persona: z.string().min(1).max(100),
  systemPrompt: z.string().max(5000),
  welcomeMessage: z.string().max(500),
  notifyPhone: z.string().max(20).nullable().optional(),
  orderKeywords: z.string().max(1000),
  // ---- Wave 5 humanize ----
  humanizeReplies: z.boolean().optional(),
  typingSpeedCps: z.number().int().min(8).max(80).optional(),
  preReplyDelayMs: z.number().int().min(0).max(3000).optional(),
  dynamicEmojis: z.boolean().optional(),
  replyVariations: z.boolean().optional(),
  // ---- Wave 7 sales ----
  persuasionEnabled: z.boolean().optional(),
  negotiationEnabled: z.boolean().optional(),
  negotiationFloorPct: z.number().int().min(0).max(50).optional(),
  // ---- Wave 12 performance / cache ----
  cacheEnabled: z.boolean().optional(),
  cacheTtlHours: z.number().int().min(1).max(168).optional(),
  // ---- Growth Suite: shipping auto-updates ----
  orderStatusNotifyEnabled: z.boolean().optional(),
  shippingTemplates: z.string().max(4000).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requirePermission("settings");
    const json = await req.json();
    const parsed = Body.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    await prisma.bot.upsert({
      where: { userId: user.id },
      update: parsed.data as any,
      create: { userId: user.id, ...parsed.data } as any,
    });
    // Saving the bot (name is required) completes the "إعداد البوت" onboarding
    // step. Emit the milestone here so the activation checklist advances when the
    // customer does what it sent them to do. Fire-and-forget; never blocks save.
    recordMilestone(user.id, "onboarding_completed", { via: "bot_settings" }).catch(() => {});
    void auditCtx(await getAuthContext(), "settings.bot_updated", {
      userId: user.id,
      targetType: "bot",
      metadata: { fields: Object.keys(parsed.data) },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    if (e.message === "FORBIDDEN") return NextResponse.json({ error: "ليس لديك صلاحية" }, { status: 403 });
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}
