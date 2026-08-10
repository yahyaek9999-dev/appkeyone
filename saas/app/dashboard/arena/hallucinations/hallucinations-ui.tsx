"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, ScanSearch, ShieldAlert, CheckCircle2, ArrowRight } from "lucide-react";
import Link from "next/link";

type Ev = {
  id: string;
  type: string;
  severity: string;
  confidence: number;
  source: string;
  message: string;
  status: string;
  createdAt: string;
};
type Data = {
  events: Ev[];
  openCount: number;
  resolvedCount: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
};

const SEV: Record<string, { label: string; cls: string }> = {
  high: { label: "حرج", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  medium: { label: "متوسط", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  low: { label: "منخفض", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
};
const TYPE_LABEL: Record<string, string> = {
  missing_source: "مصدر مفقود",
  low_confidence: "ثقة منخفضة",
  knowledge_conflict: "تعارض معرفة",
  contradiction: "تناقض",
  outdated: "معلومة قديمة",
  unsupported_claim: "ادعاء غير مدعوم",
};

export default function HallucinationsUi() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/arena/hallucinations", { cache: "no-store" }).then((r) =>
        r.json(),
      );
      if (j.ok) { setData(j); setLoadFailed(false); } else { setLoadFailed(true); }
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function detect() {
    setScanning(true);
    try {
      await fetch("/api/arena/hallucinations/detect", { method: "POST" });
      await load();
    } finally {
      setScanning(false);
    }
  }
  async function resolve(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/arena/hallucinations/${id}/resolve`, { method: "POST" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const shown = (data?.events || []).filter((e) => e.status === tab);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1">اختبار دقة الردود</h1>
          <p className="text-sm text-slate-400 max-w-xl">
            يكتشف مخاطر الهلوسة من إشارات حقيقية: مصادر مفقودة، ثقة منخفضة، تعارضات، ومعلومات قديمة
            — مع سير عمل للمراجعة والمعالجة.
          </p>
          <Link
            href="/dashboard/arena"
            className="text-xs text-brand-200 hover:underline inline-flex items-center gap-1 mt-1"
          >
            رجوع لساحة الاختبار <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <button
          onClick={detect}
          disabled={scanning}
          className="px-4 py-2 rounded-xl bg-brand-500/20 border border-brand-500/40 text-brand-100 text-sm font-medium inline-flex items-center gap-2 hover:bg-brand-500/30 disabled:opacity-50"
        >
          {scanning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ScanSearch className="h-4 w-4" />
          )}{" "}
          كشف الآن
        </button>
      </div>

      {loading && !data ? (
        <div className="p-12 text-center text-slate-400">
          <Loader2 className="mx-auto h-7 w-7 animate-spin" />
        </div>
      ) : !data ? (
        loadFailed && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.08] p-10 text-center text-rose-200">
            <div className="mb-2">تعذّر تحميل البيانات</div>
            <button onClick={load} className="text-sm underline text-slate-300 hover:text-white">إعادة المحاولة</button>
          </div>
        )
      ) : (
        <>
          {/* Dashboard counts */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="مفتوحة" value={data.openCount} tone={data.openCount > 0 ? "warn" : "ok"} />
            <Kpi label="معالَجة" value={data.resolvedCount} tone="ok" />
            <Kpi
              label="حرجة"
              value={data.bySeverity.high || 0}
              tone={(data.bySeverity.high || 0) > 0 ? "bad" : "ok"}
            />
            <Kpi label="متوسطة" value={data.bySeverity.medium || 0} tone="warn" />
            <Kpi label="منخفضة" value={data.bySeverity.low || 0} />
          </div>

          {Object.keys(data.byType).length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {Object.entries(data.byType).map(([t, c]) => (
                <span
                  key={t}
                  className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5"
                >
                  {TYPE_LABEL[t] || t}: {c}
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setTab("open")}
              className={`px-3 py-1.5 rounded-lg text-sm border ${tab === "open" ? "bg-white/10 border-white/20" : "bg-white/5 border-white/10"}`}
            >
              مفتوحة ({data.openCount})
            </button>
            <button
              onClick={() => setTab("resolved")}
              className={`px-3 py-1.5 rounded-lg text-sm border ${tab === "resolved" ? "bg-white/10 border-white/20" : "bg-white/5 border-white/10"}`}
            >
              معالَجة ({data.resolvedCount})
            </button>
          </div>

          {shown.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-slate-400 flex flex-col items-center gap-2">
              {tab === "open" ? (
                <>
                  <ShieldAlert className="h-8 w-8 opacity-40" /> لا توجد مخاطر مفتوحة. اضغط «كشف
                  الآن».
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-8 w-8 text-emerald-400/60" /> لا توجد عناصر معالَجة
                  بعد.
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {shown.map((e) => (
                <div
                  key={e.id}
                  className={`rounded-2xl border p-4 flex flex-wrap items-start justify-between gap-2 ${e.status === "open" ? "border-white/10 bg-white/5" : "border-white/10 bg-white/[0.02] opacity-70"}`}
                >
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-[10px] rounded-full border px-2 py-0.5 ${SEV[e.severity]?.cls}`}
                      >
                        {SEV[e.severity]?.label}
                      </span>
                      <span className="text-[10px] rounded-full bg-white/10 px-2 py-0.5 text-slate-300">
                        {TYPE_LABEL[e.type] || e.type}
                      </span>
                      <span className="text-[10px] text-slate-500">ثقة {e.confidence}%</span>
                    </div>
                    <div className="text-sm text-slate-200">{e.message}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">المصدر: {e.source}</div>
                  </div>
                  {e.status === "open" && (
                    <button
                      onClick={() => resolve(e.id)}
                      disabled={busy === e.id}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      {busy === e.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}{" "}
                      معالجة
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "bad";
}) {
  const cls = tone === "bad" ? "text-rose-300" : tone === "warn" ? "text-amber-300" : "text-white";
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
      <div className={`text-2xl font-extrabold tabular-nums ${cls}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">{label}</div>
    </div>
  );
}
