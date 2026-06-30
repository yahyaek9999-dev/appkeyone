// Testing Arena 2.1 — TA-3 Auto Optimization Engine.
//
// Each job runs a REAL optimization action (reindex / knowledge-graph rebuild)
// through queued → running → completed, recording the arena score before vs
// after so improvement is measured. Text-generation optimizations (prompt/FAQ)
// note that the generative step requires an LLM key (READY FOR CONFIGURATION);
// their structural pass (reindex) is real and still scored.
import { prisma } from "@/lib/db";
import { reindex } from "@/lib/knowledge-brain/search";
import { buildGraph } from "@/lib/knowledge-brain/graph";
import { runArena } from "./runner";

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
    } else if (job.type === "prompt" || job.type === "faq" || job.type === "quick_reply") {
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
