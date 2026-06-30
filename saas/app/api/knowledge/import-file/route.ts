import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { parsePdf, parseDocx } from "@/lib/knowledge-import";
import { invalidateKnowledgeCache } from "@/lib/kb-cache";
import { apiGate } from "@/lib/membership/gate";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
// Allow up to 10 MB upload
export const maxDuration = 30;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_DECOMPRESSED_BYTES = 80 * 1024 * 1024;

/**
 * Sum the uncompressed sizes declared in a ZIP's local file headers without
 * inflating anything. DOCX is a ZIP, and mammoth/jszip will inflate every entry
 * into the heap with no cap — a sub-10 MB "zip bomb" can expand to GBs. We scan
 * the central/local headers cheaply and reject when the declared total exceeds
 * the cap. Fails OPEN (returns 0) on any parse uncertainty so legitimate DOCX
 * files are never blocked.
 */
function declaredZipUncompressedBytes(buf: Buffer): number {
  try {
    let total = 0;
    let offset = 0;
    const len = buf.length;
    while (offset + 30 <= len) {
      // local file header signature PK\x03\x04
      if (
        buf[offset] === 0x50 &&
        buf[offset + 1] === 0x4b &&
        buf[offset + 2] === 0x03 &&
        buf[offset + 3] === 0x04
      ) {
        const uncompressed = buf.readUInt32LE(offset + 22);
        const compressed = buf.readUInt32LE(offset + 18);
        const fnLen = buf.readUInt16LE(offset + 26);
        const extraLen = buf.readUInt16LE(offset + 28);
        total += uncompressed;
        if (total > MAX_DECOMPRESSED_BYTES) return total;
        const next = offset + 30 + fnLen + extraLen + compressed;
        offset = next > offset ? next : offset + 1;
      } else {
        offset++;
      }
    }
    return total;
  } catch {
    return 0; // fail open — never block a legit file on our own parse error
  }
}

export async function POST(req: Request) {
  const gate = await apiGate("knowledge_base");
  if (gate.response) return gate.response;
  try {
    const user = await requirePermission("settings");

    // Throttle this CPU/heap-intensive endpoint per tenant (parsing PDF/DOCX).
    const limited = enforceRateLimit(req, {
      name: "knowledge-import-file",
      identifier: user.id,
      ...RATE_LIMITS.api,
    });
    if (limited) return limited;

    // Fast-fail on an oversized Content-Length before buffering the whole body.
    const cl = Number(req.headers.get("content-length") ?? 0);
    if (cl && cl > MAX_UPLOAD_BYTES + 1024 * 1024) {
      return NextResponse.json({ error: "حجم الملف أكبر من 10MB" }, { status: 413 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
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
      text = r.text;
      title = r.title;
      kind = "pdf";
    } else if (lowerName.endsWith(".docx") || file.type.includes("wordprocessingml")) {
      // Reject DOCX zip bombs (compressed < 10 MB but inflate to GBs) before
      // handing the buffer to mammoth/jszip, which inflate with no size cap.
      if (declaredZipUncompressedBytes(buf) > MAX_DECOMPRESSED_BYTES) {
        return NextResponse.json({ error: "الملف كبير جداً بعد فك الضغط" }, { status: 413 });
      }
      const r = await parseDocx(buf);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      text = r.text;
      kind = "docx";
    } else if (lowerName.endsWith(".txt") || file.type === "text/plain") {
      const raw = buf.toString("utf8").replace(/\r\n/g, "\n").trim();
      if (!raw || raw.length < 2) {
        return NextResponse.json({ error: "الملف فارغ" }, { status: 400 });
      }
      text = raw.slice(0, 60_000);
      kind = "txt";
    } else {
      return NextResponse.json(
        { error: "نوع الملف غير مدعوم. ندعم PDF و Word و TXT فقط." },
        { status: 400 },
      );
    }

    const finalTitle =
      title && title.trim()
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
      { status: e.message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
