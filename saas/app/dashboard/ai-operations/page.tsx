/** /dashboard/ai-operations — AI provider usage, cost, failures, latency + switch/test (B3). */
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PROVIDER_LABELS } from "@/lib/providers/types";
import AiOperationsClient from "./ai-operations-client";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";

export const dynamic = "force-dynamic";

export default async function AiOperationsPage() {
  const gate = await pageGate("ai_operations");
  if (!gate.uid) redirect("/login");
  if (!gate.allowed) return <LockedFeature title="مركز عمليات الذكاء الاصطناعي" description="مراقبة أداء مزوّدي الذكاء الاصطناعي، التكاليف، والأعطال في الوقت الفعلي" recommendedTier={gate.recommendedTier} />;
  const uid = gate.uid;
  const bot = (await prisma.bot.findUnique({ where: { userId: uid }, select: { aiProvider: true, aiModel: true, aiApiKeyEnc: true } })) as any;

  const logs = await prisma.providerCallLog.findMany({
    where: { userId: uid, domain: "ai" }, orderBy: { createdAt: "desc" }, take: 500,
    select: { provider: true, ok: true, latencyMs: true, failedOver: true, error: true, createdAt: true, operation: true },
  }).catch(() => [] as any[]);

  const agg: Record<string, { calls: number; ok: number; latSum: number; failover: number }> = {};
  for (const l of logs) {
    const a = (agg[l.provider] ||= { calls: 0, ok: 0, latSum: 0, failover: 0 });
    a.calls++; if (l.ok) a.ok++; a.latSum += l.latencyMs || 0; if (l.failedOver) a.failover++;
  }
  const providerStats = Object.entries(agg).map(([provider, a]) => ({
    provider, label: (PROVIDER_LABELS as any)[provider] || provider,
    calls: a.calls, okRate: a.calls ? Math.round((a.ok / a.calls) * 100) : 0,
    avgLatency: a.calls ? Math.round(a.latSum / a.calls) : 0, failover: a.failover,
  })).sort((x, y) => y.calls - x.calls);

  const recentFailures = logs.filter((l) => !l.ok).slice(0, 12);
  const totals = { calls: logs.length, failures: logs.filter((l) => !l.ok).length, failovers: logs.filter((l) => l.failedOver).length };

  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">عمليات المساعد</h1>
      <p className="page-desc">المزوّد الحالي، الاستخدام، الأعطال، زمن الاستجابة وتجاوز المزوّد (failover) — مع تبديل المزوّد واختباره.</p>
      <AiOperationsClient
        current={{ provider: bot?.aiProvider || "keyone", label: (PROVIDER_LABELS as any)[bot?.aiProvider || "keyone"] || bot?.aiProvider || "KeyOne", model: bot?.aiModel || "", hasKey: !!bot?.aiApiKeyEnc }}
        providers={Object.entries(PROVIDER_LABELS).map(([id, label]) => ({ id, label }))}
        providerStats={providerStats}
        recentFailures={JSON.parse(JSON.stringify(recentFailures))}
        totals={totals}
      />
    </div>
  );
}
