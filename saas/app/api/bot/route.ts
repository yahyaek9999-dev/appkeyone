import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

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
    const user = await requireUser();
    const json = await req.json();
    const parsed = Body.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    await prisma.bot.upsert({
      where: { userId: user.id },
      update: parsed.data as any,
      create: { userId: user.id, ...parsed.data } as any,
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.message === "UNAUTHORIZED") return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}
