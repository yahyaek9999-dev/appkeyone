// Testing Arena 2.1 — TA-5 Hallucination Detection Engine.
//
// Deterministic detection (no LLM) of hallucination RISK from real signals:
//   • missing_source / low_confidence — arena scenarios the brain can't ground
//   • knowledge_conflict / contradiction — unresolved KnowledgeConflict rows
//   • outdated — documents older than 6 months
// Each event carries severity + confidence + source + status, with a
// detected → review → resolve workflow. (Semantic contradiction between free
// text would need an LLM — that deeper pass is READY FOR CONFIGURATION.)
import { prisma } from "@/lib/db";
import { getLatestArena } from "./runner";

export async function detectHallucinations(userId: string) {
  const candidates: {
    type: string;
    severity: string;
    confidence: number;
    source: string;
    message: string;
  }[] = [];

  // 1) From arena weaknesses — failing categories = no grounded source.
  const latest = await getLatestArena(userId);
  for (const w of latest.weaknesses) {
    if (w.fail > 0)
      candidates.push({
        type: "missing_source",
        severity: "high",
        confidence: 90,
        source: `فئة: ${w.label}`,
        message: `${w.fail} سيناريو بلا مصدر معرفي يدعم الإجابة — خطر اختلاق إجابة في فئة «${w.label}».`,
      });
    else if (w.weak > 0)
      candidates.push({
        type: "low_confidence",
        severity: "medium",
        confidence: 60,
        source: `فئة: ${w.label}`,
        message: `إجابات منخفضة الثقة في فئة «${w.label}» — قد تكون غير دقيقة.`,
      });
  }

  // 2) From unresolved knowledge conflicts = contradictions.
  const conflicts = await (prisma as any).knowledgeConflict
    .findMany({ where: { userId, resolved: false }, take: 20 })
    .catch(() => []);
  for (const c of conflicts)
    candidates.push({
      type: "contradiction",
      severity: "high",
      confidence: 95,
      source: c.entity,
      message: `تعارض في المعرفة: ${c.sourceALabel} (${c.sourceAValue}) مقابل ${c.sourceBLabel} (${c.sourceBValue}).`,
    });

  // 3) Outdated documents (> 6 months).
  const cutoff = new Date(Date.now() - 180 * 86_400_000);
  const stale = await prisma.document.findMany({
    where: { userId, createdAt: { lt: cutoff } },
    take: 20,
    select: { title: true },
  });
  for (const d of stale)
    candidates.push({
      type: "outdated",
      severity: "low",
      confidence: 50,
      source: d.title,
      message: `المستند «${d.title}» أقدم من 6 أشهر وقد يحمل معلومات غير محدّثة.`,
    });

  // Dedup against existing OPEN events by (type|source).
  const existing = await prisma.hallucinationEvent.findMany({
    where: { userId, status: "open" },
    select: { type: true, source: true },
  });
  const seen = new Set(existing.map((e) => `${e.type}|${e.source}`));
  let created = 0;
  for (const ev of candidates) {
    const key = `${ev.type}|${ev.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await prisma.hallucinationEvent.create({ data: { userId, ...ev } });
    created++;
  }
  return { created, scanned: candidates.length };
}

export async function resolveHallucination(userId: string, id: string) {
  const upd = await prisma.hallucinationEvent.updateMany({
    where: { id, userId, status: "open" },
    data: { status: "resolved", resolvedAt: new Date() },
  });
  return { ok: upd.count > 0 };
}

export async function listHallucinations(userId: string) {
  const all = await prisma.hallucinationEvent.findMany({
    where: { userId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  const open = all.filter((e) => e.status === "open");
  const resolved = all.filter((e) => e.status === "resolved");
  const bySeverity: Record<string, number> = { high: 0, medium: 0, low: 0 };
  for (const e of open) bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1;
  const byType: Record<string, number> = {};
  for (const e of open) byType[e.type] = (byType[e.type] || 0) + 1;
  return {
    events: all,
    openCount: open.length,
    resolvedCount: resolved.length,
    bySeverity,
    byType,
  };
}
