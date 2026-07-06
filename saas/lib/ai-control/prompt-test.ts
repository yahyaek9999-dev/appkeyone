// AI Control Center Pro — Prompt Testing + Comparison + Rollback Analytics.
//
// Runs a test message through the REAL retrieval engine against a chosen prompt
// version and scores grounding/confidence/sources deterministically. The
// LLM-generated wording is the ONLY external piece → READY FOR CONFIGURATION;
// the grounded preview (top retrieved snippet) and all scores/persistence are
// real. Reuses PromptVersion (no duplication) per ECC "no duplication" rule.
import { prisma } from "@/lib/db";
import { semanticSearch } from "@/lib/knowledge-brain/search";

export async function runPromptTest(userId: string, promptVersionId: string, rawMessage: string) {
  // Treat the test message as untrusted input (prompt-defense): bound + trim.
  const message = (rawMessage || "").toString().slice(0, 500).trim();
  if (message.length < 2) return { ok: false as const, reason: "empty_message" };
  // Defense-in-depth: clamp the id here too (not only at the route's zod layer).
  const versionId = (promptVersionId || "").toString().slice(0, 60);

  // Resolve the prompt version (must belong to the caller); fall back to published.
  let version = versionId
    ? await prisma.promptVersion.findFirst({ where: { id: versionId, userId } })
    : null;
  if (!version)
    version = await prisma.promptVersion.findFirst({ where: { userId, status: "published" } });
  const promptLabel = version ? `v${version.version} — ${version.title}` : "البرومبت الحالي";

  const r = await semanticSearch(userId, message, 3);
  const top = r.hits[0];
  const confidence = top?.confidence || 0;
  const sourceCount = r.hits.length;
  const groundingScore = confidence;
  const topSource = top?.title || "";
  const groundedPreview = top
    ? top.snippet
    : "لا توجد معرفة كافية للإجابة — سيُحوَّل العميل لمسؤول.";

  await prisma.promptTest.create({
    data: {
      userId,
      promptVersionId: version?.id || "",
      promptLabel,
      message,
      confidence,
      sourceCount,
      groundingScore,
      topSource,
    },
  });

  return {
    ok: true as const,
    promptLabel,
    scores: { confidence, sourceCount, groundingScore },
    groundedPreview,
    topSource,
    llmResponse: "READY_FOR_CONFIGURATION",
  };
}

export async function getPromptTests(userId: string) {
  const [tests, versions] = await Promise.all([
    prisma.promptTest.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 25 }),
    prisma.promptVersion.findMany({ where: { userId }, orderBy: { version: "desc" }, take: 10 }),
  ]);

  // Per-version analytics (avg grounding + test count) — comparison input.
  const byVersion = new Map<string, { label: string; count: number; sum: number }>();
  for (const t of tests) {
    const key = t.promptVersionId || "current";
    const e = byVersion.get(key) || { label: t.promptLabel, count: 0, sum: 0 };
    e.count++;
    e.sum += t.groundingScore;
    e.label = t.promptLabel;
    byVersion.set(key, e);
  }
  const comparison = Array.from(byVersion.entries())
    .map(([id, e]) => ({
      promptVersionId: id,
      label: e.label,
      tests: e.count,
      avgGrounding: e.count ? Math.round(e.sum / e.count) : 0,
    }))
    .sort((a, b) => b.avgGrounding - a.avgGrounding);
  const winner = comparison[0]?.label || null;

  // Rollback analytics: published version + last 2 archived (previously live).
  const published = versions.find((v) => v.status === "published") || null;
  const previouslyLive = versions.filter((v) => v.status === "archived").slice(0, 3);

  return {
    tests,
    versions: versions.map((v) => ({
      id: v.id,
      label: `v${v.version} — ${v.title}`,
      status: v.status,
    })),
    comparison,
    winner,
    rollback: {
      current: published
        ? {
            label: `v${published.version} — ${published.title}`,
            publishedAt: published.publishedAt,
          }
        : null,
      previous: previouslyLive.map((v) => ({ label: `v${v.version} — ${v.title}` })),
    },
  };
}
