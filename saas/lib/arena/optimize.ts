// Testing Arena 2.1 — TA-3 Auto Optimization Engine.
//
// Each job runs a REAL optimization action (reindex / knowledge-graph rebuild)
// through queued → running → completed, recording the arena score before vs
// after so improvement is measured. The "prompt" job additionally runs a real
// LLM rewrite pass (rewritePrompt below), targeted at the tenant's actual
// rubric gaps and open hallucination issues, and saves the result as a new
// DRAFT PromptVersion — it never auto-publishes; a human reviews/publishes it
// from the Prompt Lab (app/dashboard/bot/prompt-lab.tsx).
import { prisma } from "@/lib/db";
import { reindex } from "@/lib/knowledge-brain/search";
import { buildGraph } from "@/lib/knowledge-brain/graph";
import { runArena } from "./runner";
import { RUBRIC } from "./prompt-bench";
import { aiChatWithFailover } from "@/lib/integrations/ai";
import { createVersion } from "@/lib/prompts/manager";
import type { ChatMsg } from "@/lib/providers/types";

export const OPT_TYPES = [
  { key: "knowledge", label: "تحسين المعرفة" },
  { key: "faq", label: "تحسين الأسئلة الشائعة" },
  { key: "quick_reply", label: "تحسين الردود السريعة" },
  { key: "brain", label: "تحسين العقل (فهرسة + مخطط)" },
  { key: "prompt", label: "تحسين البرومبت" },
] as const;

export async function queueJob(userId: string, type: string) {
  return prisma.optimizationJob.create({ data: { userId, type, status: "queued" } });
}

export async function runJob(userId: string, id: string) {
  const job = await prisma.optimizationJob.findFirst({ where: { id, userId } });
  if (!job) return null;
  if (job.status === "completed") return { ok: false as const, reason: "already_done" };

  await prisma.optimizationJob.update({ where: { id }, data: { status: "running" } });
  const before =
    (await prisma.arenaRun.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }))
      ?.score || 0;
  try {
    let note = "";
    if (job.type === "brain") {
      await reindex(userId);
      await buildGraph(userId);
      note = "أُعيدت الفهرسة وبناء مخطط المعرفة.";
    } else if (job.type === "prompt") {
      await reindex(userId);
      note = await rewritePrompt(userId);
    } else if (job.type === "faq" || job.type === "quick_reply") {
      await reindex(userId);
      note = "حُسّنت البنية والفهرسة. التوليد التلقائي للنصوص يتطلب مفتاح LLM (جاهز للإعداد).";
    } else {
      await reindex(userId);
      note = "أُعيدت فهرسة المعرفة وتحسين الاسترجاع.";
    }

    const run = await runArena(userId);
    const after = run.score;
    await prisma.optimizationJob.update({
      where: { id },
      data: {
        status: "completed",
        beforeScore: before,
        afterScore: after,
        improvement: after - before,
        note,
        completedAt: new Date(),
      },
    });
    return { ok: true as const, before, after, improvement: after - before };
  } catch (e: any) {
    await prisma.optimizationJob.update({
      where: { id },
      data: { status: "failed", note: String(e?.message || e), completedAt: new Date() },
    });
    throw e;
  }
}

/** Rewrites the tenant's live prompt to close its concrete rubric/hallucination
 *  gaps, saving the result as a new DRAFT PromptVersion (never auto-published).
 *  Falls back to a structural-only note if no provider is configured or the
 *  call fails — the reindex above still ran either way. */
async function rewritePrompt(userId: string): Promise<string> {
  const current = await prisma.promptVersion.findFirst({
    where: { userId, status: "published" },
    orderBy: { version: "desc" },
  });
  const body = (current?.body || "أنت مساعد ذكي.").trim();

  const missing = RUBRIC.filter((r) => !r.re.test(body)).map((r) => r.label);
  const openIssues = await prisma.hallucinationEvent.findMany({
    where: { userId, status: "open" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { type: true, message: true },
  });

  if (!missing.length && !openIssues.length) {
    return "لا توجد فجوات واضحة في البرومبت الحالي حسب المعايير المتاحة — لم يتم إنشاء مسودة جديدة.";
  }

  const gapsText = [
    missing.length ? `نقاط ناقصة في التعليمات:\n- ${missing.join("\n- ")}` : "",
    openIssues.length
      ? `مشاكل هلوسة مفتوحة رصدها الفحص:\n${openIssues.map((i) => `- (${i.type}) ${i.message}`).join("\n")}`
      : "",
  ].filter(Boolean).join("\n\n");

  const messages: ChatMsg[] = [
    {
      role: "system",
      content:
        "أنت مهندس برومبت خبير. مهمتك تحسين تعليمات نظام (system prompt) لمساعد مبيعات واتساب عربي، مع الحفاظ على شخصيته وأسلوبه الأساسي، وسدّ الفجوات المذكورة فقط. أعد نص التعليمات المحسّن الكامل فقط — بدون أي شرح أو مقدمة أو علامات markdown.",
    },
    {
      role: "user",
      content: `التعليمات الحالية:\n${body}\n\n${gapsText}\n\nأعد نسخة محسّنة كاملة من التعليمات تعالج الفجوات أعلاه.`,
    },
  ];

  const r = await aiChatWithFailover(userId, messages, { temperature: 0.4, maxTokens: 1200, timeoutMs: 45000 });
  if (!r.ok) {
    return r.reason === "no_provider_configured"
      ? "حُسّنت البنية والفهرسة. إعادة كتابة البرومبت تتطلب إعداد مزوّد ذكاء اصطناعي لهذا الحساب."
      : "حُسّنت البنية والفهرسة. تعذّر توليد مسودة برومبت محسّنة حالياً — حاول مرة أخرى لاحقاً.";
  }
  const rewritten = (r.result.text || "").trim().slice(0, 8000);
  if (rewritten.length < 10) {
    return "حُسّنت البنية والفهرسة. لم يُرجع المزوّد نصاً صالحاً لمسودة برومبت جديدة.";
  }
  const draft = await createVersion(userId, "تحسين تلقائي (Prompt Optimizer)", rewritten);
  return `تم إنشاء مسودة برومبت محسّنة (v${draft.version}) تعالج ${missing.length} نقطة ناقصة${openIssues.length ? ` و${openIssues.length} مشكلة هلوسة مفتوحة` : ""} — راجعها وانشرها من «مختبر البرومبت».`;
}

export async function listJobs(userId: string) {
  const [queue, history] = await Promise.all([
    prisma.optimizationJob.findMany({
      where: { userId, status: { in: ["queued", "running"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.optimizationJob.findMany({
      where: { userId, status: { in: ["completed", "failed"] } },
      orderBy: { completedAt: "desc" },
      take: 30,
    }),
  ]);
  return { queue, history };
}
