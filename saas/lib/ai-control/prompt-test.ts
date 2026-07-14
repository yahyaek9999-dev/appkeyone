// AI Control Center Pro — Prompt Testing + Comparison + Rollback Analytics.
//
// Runs a test message through the REAL retrieval engine against a chosen prompt
// version, scores grounding/confidence/sources deterministically, then calls
// the tenant's configured provider (aiChatWithFailover — same vault/failover
// path as every other tenant-scoped AI call) so llmResponse is a genuine
// generated reply, not a placeholder. Reuses PromptVersion (no duplication)
// per ECC "no duplication" rule. This never touches Bot.systemPrompt or the
// live WhatsApp reply path — it is a read-only test call.
import { prisma } from "@/lib/db";
import { semanticSearch } from "@/lib/knowledge-brain/search";
import { aiChatWithFailover } from "@/lib/integrations/ai";
import type { ChatMsg } from "@/lib/providers/types";

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

  const llmResponse = await generateTestReply(userId, version?.body, groundedPreview, message);

  return {
    ok: true as const,
    promptLabel,
    scores: { confidence, sourceCount, groundingScore },
    groundedPreview,
    topSource,
    llmResponse,
  };
}

/** Generates the actual test reply for a candidate prompt version. Read-only —
 *  never writes to Bot.systemPrompt or any conversation/customer row. Exported
 *  for reuse by lib/arena/prompt-bench.ts (side-by-side candidate comparison). */
export async function generateTestReply(
  userId: string,
  promptBody: string | undefined,
  groundedPreview: string,
  message: string
): Promise<string> {
  const system = (promptBody || "أنت مساعد ذكي.").trim();
  const messages: ChatMsg[] = [
    { role: "system", content: system },
    { role: "system", content: `معلومات من قاعدة المعرفة قد تفيد في الرد:\n${groundedPreview}`.slice(0, 2000) },
    { role: "user", content: message },
  ];
  const r = await aiChatWithFailover(userId, messages, { temperature: 0.6, maxTokens: 500, timeoutMs: 30000 });
  if (!r.ok) {
    return r.reason === "no_provider_configured"
      ? "لم يتم إعداد أي مزوّد ذكاء اصطناعي لهذا الحساب بعد."
      : "تعذّر توليد رد تجريبي حالياً — حاول مرة أخرى.";
  }
  return r.result.text || "";
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
