import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, authErrorStatus } from "@/lib/auth";
import { invalidateKnowledgeCache } from "@/lib/kb-cache";

const Body = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
  source: z.enum(["manual", "faq", "products"]).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requirePermission("settings");
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    const { title, content, source } = parsed.data;
    const doc = await prisma.document.create({
      data: { userId: user.id, title, content, source: source ?? "manual" } as any,
    });
    invalidateKnowledgeCache(user.id);
    return NextResponse.json({ ok: true, doc });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: authErrorStatus(e) });
  }
}
