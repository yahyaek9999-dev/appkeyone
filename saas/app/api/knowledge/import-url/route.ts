import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { crawlUrl } from "@/lib/knowledge-import";
import { invalidateKnowledgeCache } from "@/lib/kb-cache";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await requirePermission("settings");

    // Abuse/SSRF guard: external URL fetch — rate-limit per workspace.
    const limited = enforceRateLimit(req, { name: "knowledge-import-url", identifier: user.id, ...RATE_LIMITS.api });
    if (limited) return limited;

    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }

    const r = await crawlUrl(url.trim());
    if (!r.ok) return NextResponse.json({ error: r.error || "crawl failed" }, { status: 400 });

    const title = r.title || tryHostname(url) || "صفحة مستوردة";
    const doc = await prisma.document.create({
      data: {
        userId: user.id,
        title: title.slice(0, 200),
        content: r.text!,
        source: "url",
        sourceUrl: url,
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

function tryHostname(u: string): string {
  try { return new URL(u).hostname; } catch { return ""; }
}
