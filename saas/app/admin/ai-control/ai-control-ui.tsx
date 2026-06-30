"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  Loader2,
  RefreshCw,
  Download,
  Cpu,
  Coins,
  BookOpen,
  ShieldAlert,
} from "lucide-react";

type Provider = {
  provider: string;
  callsWindow: number;
  callsToday: number;
  failures: number;
  successPct: number | null;
  errorPct: number | null;
  avgLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  status: "green" | "yellow" | "red" | "idle";
};
type Data = {
  window: string;
  generatedAt: string;
  providers: Provider[];
  cost: null | {
    estUsd: number;
    pricesConfigured: boolean;
    llmCalls: number;
    llmFailures: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    avgLatencyMs: number;
    merchants: number;
    topCustomers: {
      email: string;
      name: string | null;
      llmCalls: number;
      totalTokens: number;
      estUsd: number;
    }[];
  };
  brain: {
    documents: number;
    knowledgeGaps: number;
    knowledgeConflicts: number;
    merchantsWithKb: number;
  };
  quality: {
    escalationTickets: number;
    openTickets: number;
    conversations: number;
    escalationRatePct: number;
    avgConfidence: number | null;
  };
};

const DOT: Record<string, string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-rose-500",
  idle: "bg-slate-600",
};
const PROVIDER_LABEL: Record<string, string> = {
  keyone: "KEYONE AI",
  openai: "OpenAI",
  claude: "Claude",
  gemini: "Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
};

export default function AiControlUi() {
  const [win, setWin] = useState<"today" | "week" | "month">("month");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setLoading(true);
      try {
        const r = await fetch(`/api/admin/ai-control?window=${win}`, { cache: "no-store" });
        const j = await r.json();
        if (j.ok) setData(j);
      } finally {
        setLoading(false);
      }
    },
    [win],
  );

  useEffect(() => {
    load(true);
  }, [load]);
  // Realtime refresh every 15s.
  useEffect(() => {
    const id = setInterval(() => load(false), 15000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["today", "week", "month"] as const).map((w) => (
            <button
              key={w}
              onClick={() => setWin(w)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${win === w ? "bg-brand-500/20 border-brand-500/40 text-brand-200" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"}`}
            >
              {w === "today" ? "اليوم" : w === "week" ? "الأسبوع" : "الشهر"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/admin/ai-control/export?window=${win}`}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10 inline-flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" /> تصدير CSV
          </a>
          <button
            onClick={() => load(true)}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10 inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> تحديث
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="p-12 text-center text-slate-400">
          <Loader2 className="mx-auto h-7 w-7 animate-spin" />
        </div>
      ) : !data ? (
        <div className="p-8 text-center text-slate-400">تعذّر تحميل البيانات.</div>
      ) : (
        <>
          {/* Cost / usage summary */}
          {data.cost && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi
                icon={<Coins className="h-4 w-4 text-amber-300" />}
                label="التكلفة التقديرية"
                value={`$${data.cost.estUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                sub={data.cost.pricesConfigured ? "أسعار مُهيّأة" : "أسعار افتراضية"}
              />
              <Kpi
                icon={<Cpu className="h-4 w-4 text-brand-300" />}
                label="طلبات الذكاء"
                value={data.cost.llmCalls.toLocaleString()}
                sub={`${data.cost.llmFailures} فشل`}
              />
              <Kpi
                icon={<Activity className="h-4 w-4 text-sky-300" />}
                label="إجمالي التوكنات"
                value={data.cost.totalTokens.toLocaleString()}
                sub={`${data.cost.inputTokens.toLocaleString()} ↓ / ${data.cost.outputTokens.toLocaleString()} ↑`}
              />
              <Kpi
                icon={<Activity className="h-4 w-4 text-emerald-300" />}
                label="متوسط زمن الرد"
                value={`${data.cost.avgLatencyMs} ms`}
                sub={`${data.cost.merchants} تاجر نشط`}
              />
            </div>
          )}

          {/* Provider health */}
          <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="border-b border-white/10 p-4 font-bold flex items-center gap-2">
              <Activity className="h-4 w-4 text-brand-400" /> صحة المزوّدين
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-white/5 text-slate-400">
                  <tr>
                    <th className="text-right p-3">المزوّد</th>
                    <th className="text-right p-3">الحالة</th>
                    <th className="text-right p-3">طلبات اليوم</th>
                    <th className="text-right p-3">طلبات الفترة</th>
                    <th className="text-right p-3">نجاح</th>
                    <th className="text-right p-3">خطأ</th>
                    <th className="text-right p-3">زمن الرد</th>
                    <th className="text-right p-3">التوكنات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.providers.map((p) => (
                    <tr key={p.provider} className="border-t border-white/5">
                      <td className="p-3 font-medium">
                        {PROVIDER_LABEL[p.provider] || p.provider}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-2.5 w-2.5 rounded-full ${DOT[p.status]}`} />
                          {p.status === "idle"
                            ? "خامل"
                            : p.status === "green"
                              ? "سليم"
                              : p.status === "yellow"
                                ? "متوسط"
                                : "متعثّر"}
                        </span>
                      </td>
                      <td className="p-3 tabular-nums">{p.callsToday.toLocaleString()}</td>
                      <td className="p-3 tabular-nums">{p.callsWindow.toLocaleString()}</td>
                      <td className="p-3 tabular-nums">
                        {p.successPct === null ? "—" : `${p.successPct}%`}
                      </td>
                      <td className="p-3 tabular-nums">
                        {p.errorPct === null ? "—" : `${p.errorPct}%`}
                      </td>
                      <td className="p-3 tabular-nums">
                        {p.avgLatencyMs ? `${p.avgLatencyMs} ms` : "—"}
                      </td>
                      <td className="p-3 tabular-nums">
                        {(p.inputTokens + p.outputTokens).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Brain + Quality */}
          <div className="grid gap-3 lg:grid-cols-2">
            <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="font-bold mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-violet-300" /> عقل المعرفة
              </h2>
              <div className="grid grid-cols-2 gap-3 text-center">
                <Mini label="المستندات" value={data.brain.documents} />
                <Mini
                  label="فجوات معرفية"
                  value={data.brain.knowledgeGaps}
                  tone={data.brain.knowledgeGaps > 0 ? "warn" : "ok"}
                />
                <Mini
                  label="تعارضات مفتوحة"
                  value={data.brain.knowledgeConflicts}
                  tone={data.brain.knowledgeConflicts > 0 ? "warn" : "ok"}
                />
                <Mini label="تجار بمعرفة" value={data.brain.merchantsWithKb} />
              </div>
            </section>
            <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="font-bold mb-3 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-300" /> جودة الردود
              </h2>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Mini
                  label="معدل التصعيد"
                  value={`${data.quality.escalationRatePct}%`}
                  tone={data.quality.escalationRatePct > 25 ? "warn" : "ok"}
                />
                <Mini
                  label="تذاكر مفتوحة"
                  value={data.quality.openTickets}
                  tone={data.quality.openTickets > 0 ? "warn" : "ok"}
                />
                <Mini
                  label="متوسط الثقة"
                  value={
                    data.quality.avgConfidence === null ? "—" : `${data.quality.avgConfidence}%`
                  }
                />
              </div>
            </section>
          </div>

          {/* Top customers */}
          {data.cost && data.cost.topCustomers.length > 0 && (
            <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="border-b border-white/10 p-4 font-bold">أعلى العملاء استهلاكاً</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead className="bg-white/5 text-slate-400">
                    <tr>
                      <th className="text-right p-3">العميل</th>
                      <th className="text-right p-3">طلبات</th>
                      <th className="text-right p-3">توكنات</th>
                      <th className="text-right p-3">تكلفة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cost.topCustomers.map((c, i) => (
                      <tr key={i} className="border-t border-white/5">
                        <td className="p-3">
                          <div className="font-medium">{c.name || "—"}</div>
                          <div className="text-xs text-slate-400">{c.email}</div>
                        </td>
                        <td className="p-3 tabular-nums">{c.llmCalls.toLocaleString()}</td>
                        <td className="p-3 tabular-nums">{c.totalTokens.toLocaleString()}</td>
                        <td className="p-3 tabular-nums">
                          ${c.estUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <p className="text-[11px] text-slate-500">
            آخر تحديث: {new Date(data.generatedAt).toLocaleString("ar-EG")} · يتحدّث تلقائياً كل 15
            ثانية
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "ok" | "warn";
}) {
  const cls = tone === "warn" ? "text-amber-300" : "text-white";
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
      <div className={`text-xl font-bold tabular-nums ${cls}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">{label}</div>
    </div>
  );
}
