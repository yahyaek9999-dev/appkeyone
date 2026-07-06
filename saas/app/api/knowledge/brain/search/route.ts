// AI Knowledge Brain — "ask your knowledge" search endpoint (read-only, gated).
//
// GET /api/knowledge/brain/search?q=...
//   401 unauthenticated · 403 {error:"disabled"} when the add-on is off.
//   200 { results:[{docTitle,text,score}], cited:boolean }
//
// Reuses the EXISTING TF-cosine retrieval in @/lib/kb-cache
// (retrieveRelevantKb) — no external vector DB, no new retrieval logic. That
// helper returns a joined "### <docTitle>\n<chunk>" string ready for a system
// prompt; here we parse it back into discrete results and attach a confidence
// score per chunk using the same semantic-match primitives the cache uses
// internally, so the merchant sees WHY a source was cited and how strong it is.

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { knowledgeBrainEnabled } from "@/lib/knowledge-brain/flags";
import { retrieveRelevantKb } from "@/lib/kb-cache";
import { tokenize, tfVector, cosine, jaccard } from "@/lib/semantic-match";
import { apiGate } from "@/lib/membership/gate";

export const dynamic = "force-dynamic";

interface BrainResult {
  docTitle: string;
  text: string;
  score: number;
}

/** Split the joined retrieval output back into discrete "### title\ntext" blocks. */
function parseRetrieval(joined: string): { docTitle: string; text: string }[] {
  if (!joined.trim()) return [];
  // retrieveRelevantKb joins blocks with "\n\n" and prefixes each with "### ".
  const blocks = joined.split(/\n{2,}(?=### )/);
  const out: { docTitle: string; text: string }[] = [];
  for (const b of blocks) {
    const m = b.match(/^###\s+(.*?)\n([\s\S]*)$/);
    if (m) {
      out.push({ docTitle: m[1].trim(), text: m[2].trim() });
    } else if (b.trim()) {
      // Fallback head-of-KB path (no "### " markers): treat as one untitled block.
      out.push({ docTitle: "", text: b.trim() });
    }
  }
  return out;
}

export async function GET(req: Request) {
  const gate = await apiGate("knowledge_base");
  if (gate.response) return gate.response;
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  if (!(await knowledgeBrainEnabled(uid))) {
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  }

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ results: [], cited: false });

  // Top-K relevant chunks via the shared cache + TF retrieval.
  const joined = await retrieveRelevantKb(uid, q, { k: 5, charBudget: 4000 });
  const blocks = parseRetrieval(joined);

  // Re-score each returned block against the query so the UI can show a
  // confidence number. Mirrors the cache's internal 0.7*cosine + 0.3*jaccard.
  const qTokens = tokenize(q);
  const qVec = tfVector(qTokens);
  const results: BrainResult[] = blocks.map((b) => {
    const tks = tokenize(b.text);
    const score =
      qTokens.length >= 2 ? 0.7 * cosine(qVec, tfVector(tks)) + 0.3 * jaccard(qTokens, tks) : 0;
    return { docTitle: b.docTitle, text: b.text, score: Math.round(score * 1000) / 1000 };
  });

  results.sort((a, b) => b.score - a.score);

  // "cited" = we found at least one titled, non-trivially-relevant source.
  const cited = results.some((r) => r.docTitle !== "" && r.score >= 0.05);

  return NextResponse.json({ results, cited });
}
