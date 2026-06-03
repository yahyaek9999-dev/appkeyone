// AI Knowledge Brain — health snapshot endpoint (read-only, gated).
//
// GET /api/knowledge/brain
//   401 when unauthenticated.
//   403 {error:"disabled"} when the tenant doesn't have the add-on enabled.
//   200 { health, docs } otherwise — the merchant's coverage/health score plus
//       a short list of recent documents for the Upload Center.
//
// Pure aggregation of the existing Document table; no new models, no mutation,
// never touches the WhatsApp send pipeline.

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { knowledgeBrainEnabled } from "@/lib/knowledge-brain/flags";
import { computeKnowledgeHealth } from "@/lib/knowledge-brain/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  // Paid gate: OFF by default, admin-enabled per tenant.
  if (!(await knowledgeBrainEnabled(uid))) {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  }

  const [health, docs] = await Promise.all([
    computeKnowledgeHealth(uid),
    prisma.document.findMany({
      where: { userId: uid },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        title: true,
        source: true,
        sourceUrl: true,
        content: true,
        hitCount: true,
        lastMatchedAt: true,
        createdAt: true,
      },
    }),
  ]);

  // Trim content down to a length preview so the list payload stays small —
  // the full text is never needed in the upload-center list.
  const recent = docs.map((d) => ({
    id: d.id,
    title: d.title,
    source: d.source,
    sourceUrl: d.sourceUrl,
    chars: d.content?.length ?? 0,
    hitCount: d.hitCount,
    lastMatchedAt: d.lastMatchedAt,
    createdAt: d.createdAt,
  }));

  return NextResponse.json({ health, docs: recent });
}
