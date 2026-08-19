// SLA Center — measures ONLY what the app actually records.
//
// Real sources:
//   ApiRequestLog.latencyMs   → API latency (avg over window)
//   ProviderUsage.totalLatencyMs / calls → AI latency (avg)
//   outgoing-queue oldestQueuedAgeSec → WhatsApp send/queue latency (current)
//   Incident.resolvedAt - createdAt → incident resolution time (avg)
//
// Targets are conservative defaults marked as such. Where the app stores no
// history for a metric, `historical: false` is set and the UI says so — no
// fabricated trend. A metric with no data at all is status "unavailable".

import { prisma } from "@/lib/db";

export type SlaStatus = "healthy" | "at_risk" | "breached" | "unavailable";

export type SlaMetric = {
  key: string;
  label: string;
  unit: string;
  current: number | null;   // null → unavailable
  target: number;
  status: SlaStatus;
  sampleSize: number;
  historical: boolean;      // true only if we have real historical series (we don't persist one → false)
  note: string;
};

export type SlaResult = { generatedAt: string; windowDays: number; metrics: SlaMetric[] };

// Conservative default targets (documented; not business-committed SLAs).
const TARGETS = {
  apiLatencyMs: 800,
  aiLatencyMs: 8000,
  waQueueAgeSec: 300,
  incidentResolutionHours: 48,
};

function statusFor(current: number | null, target: number): SlaStatus {
  if (current == null) return "unavailable";
  if (current <= target) return "healthy";
  if (current <= target * 1.5) return "at_risk";
  return "breached";
}

export async function getSlaMetrics(windowDays = 7): Promise<SlaResult> {
  const since = new Date(Date.now() - windowDays * 86_400_000);

  const [apiAgg, providerAgg, queueHealth, resolvedIncidents] = await Promise.all([
    (prisma as any).apiRequestLog
      ?.aggregate({ where: { createdAt: { gte: since } }, _avg: { latencyMs: true }, _count: true })
      .catch(() => ({ _avg: { latencyMs: null }, _count: 0 })) ?? { _avg: { latencyMs: null }, _count: 0 },
    (prisma as any).providerUsage
      ?.aggregate({ where: { lastAt: { gte: since } }, _sum: { totalLatencyMs: true, calls: true } })
      .catch(() => ({ _sum: { totalLatencyMs: null, calls: null } })) ?? { _sum: { totalLatencyMs: null, calls: null } },
    (async () => {
      try {
        const { getOutgoingQueueHealth } = await import("@/lib/messaging/outgoing-queue");
        return await getOutgoingQueueHealth();
      } catch {
        return null;
      }
    })(),
    prisma.incident
      .findMany({ where: { status: { in: ["resolved", "closed"] }, resolvedAt: { not: null, gte: since } }, select: { createdAt: true, resolvedAt: true }, take: 500 })
      .catch(() => []),
  ]);

  const metrics: SlaMetric[] = [];

  // API latency
  const apiAvg = apiAgg._avg?.latencyMs ?? null;
  metrics.push({
    key: "api_latency",
    label: "زمن استجابة API",
    unit: "ms",
    current: apiAvg != null ? Math.round(apiAvg) : null,
    target: TARGETS.apiLatencyMs,
    status: statusFor(apiAvg, TARGETS.apiLatencyMs),
    sampleSize: apiAgg._count ?? 0,
    historical: false,
    note: apiAvg == null ? "لا طلبات API مُسجّلة في النافذة" : "متوسط فعلي على النافذة",
  });

  // AI latency
  const calls = providerAgg._sum?.calls ?? 0;
  const totalLat = providerAgg._sum?.totalLatencyMs ?? 0;
  const aiAvg = calls > 0 ? Math.round(totalLat / calls) : null;
  metrics.push({
    key: "ai_latency",
    label: "زمن استجابة الذكاء الاصطناعي",
    unit: "ms",
    current: aiAvg,
    target: TARGETS.aiLatencyMs,
    status: statusFor(aiAvg, TARGETS.aiLatencyMs),
    sampleSize: calls,
    historical: false,
    note: aiAvg == null ? "لا استدعاءات ذكاء في النافذة" : "متوسط فعلي (إجمالي الزمن ÷ الاستدعاءات)",
  });

  // WhatsApp queue latency (current snapshot)
  const oldestSec = queueHealth?.oldestQueuedAgeSec ?? null;
  metrics.push({
    key: "wa_queue",
    label: "زمن انتظار طابور واتساب",
    unit: "s",
    current: oldestSec != null ? Math.round(oldestSec) : (queueHealth ? 0 : null),
    target: TARGETS.waQueueAgeSec,
    status: queueHealth == null ? "unavailable" : statusFor(oldestSec ?? 0, TARGETS.waQueueAgeSec),
    sampleSize: queueHealth?.staleQueued ?? 0,
    historical: false,
    note: queueHealth == null ? "تعذّر قراءة حالة الطابور" : "لقطة حالية لأقدم رسالة منتظرة",
  });

  // Incident resolution time
  let incAvgHours: number | null = null;
  if ((resolvedIncidents as any[]).length) {
    const totalMs = (resolvedIncidents as any[]).reduce((sum, i) => sum + (new Date(i.resolvedAt).getTime() - new Date(i.createdAt).getTime()), 0);
    incAvgHours = Math.round((totalMs / (resolvedIncidents as any[]).length / 3_600_000) * 10) / 10;
  }
  metrics.push({
    key: "incident_resolution",
    label: "متوسط زمن حل الحوادث",
    unit: "h",
    current: incAvgHours,
    target: TARGETS.incidentResolutionHours,
    status: statusFor(incAvgHours, TARGETS.incidentResolutionHours),
    sampleSize: (resolvedIncidents as any[]).length,
    historical: false,
    note: incAvgHours == null ? "لا حوادث محلولة في النافذة" : "متوسط فعلي على الحوادث المحلولة",
  });

  return { generatedAt: new Date().toISOString(), windowDays, metrics };
}

/** SLA breaches for the Command Center attention list (real measured breaches only). */
export async function getSlaAttention(): Promise<{ key: string; label: string; current: number; target: number; unit: string }[]> {
  const { metrics } = await getSlaMetrics(7);
  return metrics
    .filter((m) => m.status === "breached" && m.current != null)
    .map((m) => ({ key: m.key, label: m.label, current: m.current as number, target: m.target, unit: m.unit }));
}
