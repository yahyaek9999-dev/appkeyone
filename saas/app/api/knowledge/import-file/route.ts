import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parsePdf, parseDocx } from "@/lib/knowledge-import";
import { invalidateKnowledgeCache } from "@/lib/kb-cache";

export const runtime = "nodejs";
// Allow up to 10 MB upload
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "حجم الملف أكبر من 10MB" }, { status: 413 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const lowerName = file.name.toLowerCase();
    let text: string | undefined;
    let title: string | undefined;
    let kind: "pdf" | "docx" = "pdf";

    if (lowerName.endsWith(".pdf") || file.type === "application/pdf") {
      const r = await parsePdf(buf);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      text = r.text; title = r.title; kind = "pdf";
    } else if (lowerName.endsWith(".docx") || file.type.includes("wordprocessingml")) {
      const r = await parseDocx(buf);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      text = r.text; kind = "docx";
    } else {
      return NextResponse.json({ error: "نوع الملف غير مدعوم. ادعم PDF و DOCX فقط." }, { status: 400 });
    }

    const finalTitle = (title && title.trim())
      ? title.trim().slice(0, 200)
      : file.name.replace(/\.[^.]+$/, "").slice(0, 200);

    const doc = await prisma.document.create({
      data: {
        userId: user.id,
        title: finalTitle,
        content: text!,
        source: kind,
      } as any,
    });
    invalidateKnowledgeCache(user.id);
    return NextResponse.json({ ok: true, doc });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message },
      { status: e.message === "UNAUTHORIZED" ? 401 : 500 }
    );
  }
}
