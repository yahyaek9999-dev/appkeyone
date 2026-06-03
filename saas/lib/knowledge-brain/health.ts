// AI Knowledge Brain — health + coverage scoring.
//
// Composes the existing Document table (read-only) into two merchant-facing
// signals plus a missing-info detector:
//
//   coverageScore — does the knowledge base actually COVER the topics a bot
//     needs to answer well? We probe for four pillars (pricing, policies,
//     FAQ, products) by keyword across all docs. Each present pillar is worth
//     25 points. This is intentionally a heuristic — no embeddings, no vector
//     DB — matching the project's lightweight TF retrieval philosophy.
//
//   healthScore — is the knowledge base substantial and fresh enough to lean
//     on? Blends document count (volume), total characters (depth) and recency
//     (was anything added/updated lately). A brain with one stale paragraph is
//     "unhealthy" even if it happens to cover a pillar.
//
//   missing — human-readable Arabic list of the pillars not yet detected, so
//     the UI can tell the merchant exactly what to upload next.
//
// Everything here is read-only aggregation; it never mutates documents and
// never touches the WhatsApp send pipeline.

import { prisma } from "@/lib/db";

export interface KnowledgeHealth {
  docCount: number;
  totalChars: number;
  /** 0–100: how many of the four knowledge pillars are present. */
  coverageScore: number;
  /** 0–100: volume + depth + recency blend. */
  healthScore: number;
  /** Arabic labels of the pillars still missing. */
  missing: string[];
  /** Per-pillar presence, for richer UI rendering. */
  pillars: { key: PillarKey; label: string; present: boolean }[];
  /** ISO of the most recently added document, or null when empty. */
  lastUpdatedAt: string | null;
}

type PillarKey = "pricing" | "policy" | "faq" | "product";

// Keyword probes per pillar. Arabic + English so we catch bilingual KBs.
// Matching is done on a normalized lowercase concatenation of all doc text.
const PILLARS: { key: PillarKey; label: string; keywords: string[] }[] = [
  {
    key: "pricing",
    label: "الأسعار",
    keywords: ["سعر", "أسعار", "السعر", "تكلفة", "جنيه", "ج.م", "egp", "price", "pricing", "cost"],
  },
  {
    key: "policy",
    label: "السياسات والشروط",
    keywords: ["سياسة", "السياسة", "الشروط", "استرجاع", "استبدال", "ضمان", "خصوصية", "policy", "terms", "refund", "return", "warranty"],
  },
  {
    key: "faq",
    label: "الأسئلة الشائعة",
    keywords: ["سؤال", "الأسئلة", "أسئلة شائعة", "كيف", "هل", "faq", "question", "how do", "how can"],
  },
  {
    key: "product",
    label: "المنتجات والخدمات",
    keywords: ["منتج", "منتجات", "المنتج", "خدمة", "خدمات", "صنف", "موديل", "product", "service", "item"],
  },
];

/** Recency window — a doc touched within this is "fresh" for the health blend. */
const FRESH_WINDOW_DAYS = 30;

/**
 * Compute the merchant's knowledge-brain health snapshot. Read-only.
 * Safe on an empty KB (returns zeros + all pillars missing).
 */
export async function computeKnowledgeHealth(uid: string): Promise<KnowledgeHealth> {
  const docs = await prisma.document.findMany({
    where: { userId: uid },
    select: { title: true, content: true, createdAt: true },
  });

  const docCount = docs.length;
  let totalChars = 0;
  let lastUpdatedAt: string | null = null;
  let lastTs = 0;

  // One normalized haystack of title + content across every doc — cheaper than
  // re-scanning per pillar and good enough for keyword presence.
  const parts: string[] = [];
  for (const d of docs) {
    const content = d.content ?? "";
    totalChars += content.length;
    parts.push(`${d.title ?? ""}\n${content}`);
    const ts = d.createdAt instanceof Date ? d.createdAt.getTime() : new Date(d.createdAt).getTime();
    if (ts > lastTs) {
      lastTs = ts;
      lastUpdatedAt = new Date(ts).toISOString();
    }
  }
  const haystack = parts.join("\n").toLowerCase();

  // ---- Coverage: 25 pts per present pillar ----
  const pillars = PILLARS.map((p) => ({
    key: p.key,
    label: p.label,
    present: docCount > 0 && p.keywords.some((kw) => haystack.includes(kw.toLowerCase())),
  }));
  const presentCount = pillars.filter((p) => p.present).length;
  const coverageScore = Math.round((presentCount / PILLARS.length) * 100);
  const missing = pillars.filter((p) => !p.present).map((p) => p.label);

  // ---- Health: volume (40) + depth (30) + recency (30) ----
  // Volume saturates at ~6 docs; depth at ~6000 chars; recency is a 30-day
  // linear decay from the most recent doc. Empty KB -> 0.
  let healthScore = 0;
  if (docCount > 0) {
    const volume = Math.min(1, docCount / 6) * 40;
    const depth = Math.min(1, totalChars / 6000) * 30;
    let recency = 0;
    if (lastTs > 0) {
      const ageDays = (Date.now() - lastTs) / 86_400_000;
      recency = Math.max(0, 1 - ageDays / FRESH_WINDOW_DAYS) * 30;
    }
    healthScore = Math.round(volume + depth + recency);
  }
  healthScore = Math.max(0, Math.min(100, healthScore));

  return { docCount, totalChars, coverageScore, healthScore, missing, pillars, lastUpdatedAt };
}
