// Testing Arena 2.0 — run engine.
//
// Runs the whole scenario corpus through the REAL retrieval engine (no LLM, no
// key) to measure whether the knowledge base can actually answer each scenario.
// Knowledge categories are scored by retrieval confidence; robustness
// categories (spam / fake leads) "pass" when the brain correctly has nothing to
// fabricate. Results are persisted; weaknesses + deterministic fixes returned.
import { prisma } from "@/lib/db";
import { incrementalIndex, loadSearchIndex, searchIndex } from "@/lib/knowledge-brain/search";
import { SCENARIOS, SCENARIO_CATEGORIES, CATEGORY_FIX } from "./scenarios";

const ROBUSTNESS = new Set(["spam", "fake_lead"]);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export interface ArenaRunResult {
  runId: string;
  total: number;
  passed: number;
  weak: number;
  failed: number;
  score: number;
  avgConfidence: number;
  categories: {
    key: string;
    label: string;
    pass: number;
    weak: number;
    fail: number;
    avgConfidence: number;
  }[];
  weaknesses: { category: string; label: string; fail: number; weak: number; suggestion: string }[];
}

export async function runArena(userId: string): Promise<ArenaRunResult> {
  // Make sure the vector index exists, then load it ONCE for all scenarios
  // (avoids 120 DB round-trips — perf fix flagged by code review).
  await incrementalIndex(userId);
  const index = await loadSearchIndex(userId);

  const perCat = new Map<
    string,
    { label: string; pass: number; weak: number; fail: number; conf: number; n: number }
  >();
  for (const c of SCENARIO_CATEGORIES)
    perCat.set(c.key, { label: c.label, pass: 0, weak: 0, fail: 0, conf: 0, n: 0 });

  let passed = 0,
    weak = 0,
    failed = 0,
    confSum = 0,
    knowledgeWeak = 0;
  const resultRows: {
    category: string;
    message: string;
    matched: boolean;
    confidence: number;
    topDoc: string;
    verdict: string;
  }[] = [];

  for (const s of SCENARIOS) {
    const r = searchIndex(index, s.message, 3);
    const conf = r.hits[0]?.confidence || 0;
    const topDoc = r.hits[0]?.title || "";
    const robustness = ROBUSTNESS.has(s.category);
    let verdict: "pass" | "weak" | "fail";
    if (robustness) verdict = conf < 25 ? "pass" : "weak";
    else verdict = conf >= 40 ? "pass" : conf >= 15 ? "weak" : "fail";

    if (verdict === "pass") passed++;
    else if (verdict === "weak") {
      weak++;
      if (!robustness) knowledgeWeak++;
    } else failed++;
    confSum += conf;
    const cat = perCat.get(s.category)!;
    cat.n++;
    cat.conf += conf;
    cat[verdict]++;
    resultRows.push({
      category: s.category,
      message: s.message,
      matched: conf >= 15,
      confidence: conf,
      topDoc,
      verdict,
    });
  }

  const total = SCENARIOS.length;
  // Only KNOWLEDGE "weak" earns partial credit; a robustness "weak" means the
  // bot wrongly matched spam → counts as 0 (code-review logic fix).
  const score = clamp((100 * (passed + 0.5 * knowledgeWeak)) / total);
  const avgConfidence = clamp(confSum / total);

  const run = await prisma.arenaRun.create({
    data: { userId, total, passed, weak, failed, score, avgConfidence },
  });
  // Persist per-scenario results in chunks.
  for (let i = 0; i < resultRows.length; i += 50) {
    await prisma.arenaResult.createMany({
      data: resultRows.slice(i, i + 50).map((r) => ({ runId: run.id, userId, ...r })),
    });
  }

  const categories = Array.from(perCat.entries()).map(([key, v]) => ({
    key,
    label: v.label,
    pass: v.pass,
    weak: v.weak,
    fail: v.fail,
    avgConfidence: v.n ? Math.round(v.conf / v.n) : 0,
  }));
  const weaknesses = categories
    .filter((c) => !ROBUSTNESS.has(c.key) && (c.fail > 0 || c.weak > 0))
    .sort((a, b) => b.fail - a.fail || b.weak - a.weak)
    .map((c) => ({
      category: c.key,
      label: c.label,
      fail: c.fail,
      weak: c.weak,
      suggestion: CATEGORY_FIX[c.key] || "أضف معرفة لهذه الفئة.",
    }));

  return {
    runId: run.id,
    total,
    passed,
    weak,
    failed,
    score,
    avgConfidence,
    categories,
    weaknesses,
  };
}

export async function getLatestArena(userId: string) {
  const run = await prisma.arenaRun.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (!run) return { run: null, categories: [], weaknesses: [], samples: [] };
  const results = await prisma.arenaResult.findMany({ where: { runId: run.id } });
  const perCat = new Map<
    string,
    { label: string; pass: number; weak: number; fail: number; conf: number; n: number }
  >();
  for (const c of SCENARIO_CATEGORIES)
    perCat.set(c.key, { label: c.label, pass: 0, weak: 0, fail: 0, conf: 0, n: 0 });
  for (const r of results) {
    const cat = perCat.get(r.category);
    if (!cat) continue;
    cat.n++;
    cat.conf += r.confidence;
    (cat as any)[r.verdict]++;
  }
  const categories = Array.from(perCat.entries()).map(([key, v]) => ({
    key,
    label: v.label,
    pass: v.pass,
    weak: v.weak,
    fail: v.fail,
    avgConfidence: v.n ? Math.round(v.conf / v.n) : 0,
  }));
  const weaknesses = categories
    .filter((c) => !ROBUSTNESS.has(c.key) && (c.fail > 0 || c.weak > 0))
    .sort((a, b) => b.fail - a.fail || b.weak - a.weak)
    .map((c) => ({
      category: c.key,
      label: c.label,
      fail: c.fail,
      weak: c.weak,
      suggestion: CATEGORY_FIX[c.key] || "أضف معرفة لهذه الفئة.",
    }));
  const samples = results
    .filter((r) => r.verdict !== "pass")
    .slice(0, 12)
    .map((r) => ({
      category: r.category,
      message: r.message,
      confidence: r.confidence,
      verdict: r.verdict,
      topDoc: r.topDoc,
    }));
  return { run, categories, weaknesses, samples };
}
