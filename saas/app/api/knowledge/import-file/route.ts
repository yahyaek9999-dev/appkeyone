import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { parsePdf, parseDocx } from "@/lib/knowledge-import";
import { invalidateKnowledgeCache } from "@/lib/kb-cache";
import { apiGate } from "@/lib/membership/gate";

export const runtime = "nodejs";
// Allow up to 10 MB upload
export const maxDuration = 30;

export async function POST(req: Request) {
  const gate = await apiGate("knowledge_base");
  if (gate.response) return gate.response;
  try {
    const user = await requirePermission("settings");
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
    let kind: "pdf" | "docx" | "txt" = "pdf";

    if (lowerName.endsWith(".pdf") || file.type === "application/pdf") {
      const r = await parsePdf(buf);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      text = r.text; title = r.title; kind = "pdf";
    } else if (lowerName.endsWith(".docx") || file.type.includes("wordprocessingml")) {
      const r = await parseDocx(buf);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      text = r.text; kind = "docx";
    } else if (lowerName.endsWith(".txt") || file.type === "text/plain") {
      const raw = buf.toString("utf8").replace(/\r\n/g, "\n").trim();
      if (!raw || raw.length < 2) {
        return NextResponse.json({ error: "الملف فارغ" }, { status: 400 });
      }
      text = raw.slice(0, 60_000); kind = "txt";
    } else {
      return NextResponse.json({ error: "نوع الملف غير مدعوم. ندعم PDF و Word و TXT فقط." }, { status: 400 });
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
