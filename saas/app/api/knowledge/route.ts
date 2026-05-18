import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { invalidateKnowledgeCache } from "@/lib/kb-cache";

const Body = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    const doc = await prisma.document.create({
      data: { userId: user.id, ...parsed.data },
    });
    invalidateKnowledgeCache(user.id);
    return NextResponse.json({ ok: true, doc });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.message === "UNAUTHORIZED" ? 401 : 500 });
  }
}
