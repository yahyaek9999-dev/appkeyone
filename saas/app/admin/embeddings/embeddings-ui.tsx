"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  Plug,
  RefreshCw,
  Database,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Network,
} from "lucide-react";

type Provider = {
  type: string;
  name: string;
  enabled: boolean;
  priority: number;
  model: string;
  status: string;
  lastError: string;
  lastCheckedAt: string | null;
  hasKey: boolean;
  calls: number;
  failures: number;
  avgLatencyMs: number;
};
type Data = {
  providers: Provider[];
  totals: { vectors: number; calls: number; failures: number; avgLatencyMs: number };
};

const STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  healthy: { label: "سليم", cls: "text-emerald-300", dot: "bg-emerald-400" },
  failed: { label: "متعثّر", cls: "text-rose-300", dot: "bg-rose-500" },
  unknown: { label: "غير مفحوص", cls: "text-slate-400", dot: "bg-slate-600" },
};

export default function EmbeddingsUi() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [failover, setFailover] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/admin/embeddings", { cache: "no-store" }).then((r) => r.json());
      if (j.ok) setData(j);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function test(type: string) {
    setBusy(type);
    try {
      await fetch(`/api/admin/embeddings/${type}/test`, { method: "POST" });
      await load();
    } finally {
      setBusy(null);
    }
  }
  async function toggle(p: Provider) {
    setBusy(p.type);
    try {
      await fetch(`/api/admin/embeddings/${p.type}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !p.enabled }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }
  async function testAll() {
    setBusy("__all__");
    try {
      for (const p of data?.providers || [])
        await fetch(`/api/admin/embeddings/${p.type}/test`, { method: "POST" });
      await load();
    } finally {
      setBusy(null);
    }
  }
  async function runFailover() {
    setBusy("__failover__");
    try {
      const j = await fetch("/api/admin/embeddings/failover-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "كم سعر الشحن؟" }),
      }).then((r) => r.json());
      setFailover(j);
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={testAll}
          disabled={busy !== null}
          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm inline-flex items-center gap-1.5 hover:bg-white/10 disabled:opacity-50"
        >
          {busy === "__all__" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plug className="h-3.5 w-3.5" />
          )}{" "}
          فحص كل المزوّدين
        </button>
        <button
          onClick={runFailover}
          disabled={busy !== null}
          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm inline-flex items-center gap-1.5 hover:bg-white/10 disabled:opacity-50"
        >
          {busy === "__failover__" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Network className="h-3.5 w-3.5" />
          )}{" "}
          اختبار التجاوز (Failover)
        </button>
        <button
          onClick={load}
          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm inline-flex items-center gap-1.5 hover:bg-white/10"
        >
          <RefreshCw className="h-3.5 w-3.5" /> تحديث
        </button>
      </div>

      {loading && !data ? (
        <div className="p-12 text-center text-slate-400">
          <Loader2 className="mx-auto h-7 w-7 animate-spin" />
        </div>
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              icon={<Database className="h-4 w-4 text-sky-300" />}
              label="إجمالي المتجهات"
              value={data.totals.vectors.toLocaleString()}
            />
            <Kpi
              icon={<Activity className="h-4 w-4 text-brand-300" />}
              label="استدعاءات"
              value={data.totals.calls.toLocaleString()}
            />
            <Kpi
              icon={<AlertTriangle className="h-4 w-4 text-amber-300" />}
              label="إخفاقات"
              value={data.totals.failures.toLocaleString()}
              tone={data.totals.failures > 0 ? "warn" : "ok"}
            />
            <Kpi
              icon={<Activity className="h-4 w-4 text-emerald-300" />}
              label="متوسط الكمون"
              value={`${data.totals.avgLatencyMs} ms`}
            />
          </div>

          {failover && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
              <div className="font-bold mb-2 inline-flex items-center gap-2">
                <Network className="h-4 w-4 text-brand-300" /> نتيجة التجاوز:{" "}
                {failover.ok ? (
                  <span className="text-emerald-300">
                    نجح عبر «{failover.provider}» ({failover.dims} بُعد)
                  </span>
                ) : (
                  <span className="text-rose-300">فشل الكل</span>
                )}
              </div>
              <div className="space-y-1">
                {(failover.trace || []).map((t: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {t.ok ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-rose-400" />
                    )}
                    <span className="font-mono">{t.provider}</span>
                    <span className="text-slate-500">· {t.latencyMs}ms</span>
                    {t.ok ? (
                      <span className="text-emerald-300">{t.dims} بُعد</span>
                    ) : (
                      <span className="text-rose-300">{t.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="border-b border-white/10 p-4 font-bold">المزوّدون</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-white/5 text-slate-400">
                  <tr>
                    <th className="text-right p-3">المزوّد</th>
                    <th className="text-right p-3">الحالة</th>
                    <th className="text-right p-3">الأولوية</th>
                    <th className="text-right p-3">النموذج</th>
                    <th className="text-right p-3">مفتاح</th>
                    <th className="text-right p-3">استدعاءات</th>
                    <th className="text-right p-3">إخفاقات</th>
                    <th className="text-right p-3">كمون</th>
                    <th className="text-right p-3">آخر فحص</th>
                    <th className="text-right p-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.providers.map((p) => {
                    const s = STATUS[p.status] || STATUS.unknown;
                    return (
                      <tr key={p.type} className="border-t border-white/5">
                        <td className="p-3 font-medium">
                          {p.name}
                          <div className="text-[10px] text-slate-500 font-mono">{p.type}</div>
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1.5 ${s.cls}`}>
                            <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
                            {s.label}
                          </span>
                          {p.status === "failed" && p.lastError && (
                            <div className="text-[10px] text-rose-400/70">{p.lastError}</div>
                          )}
                        </td>
                        <td className="p-3 tabular-nums">{p.priority}</td>
                        <td className="p-3 text-xs font-mono text-slate-400">{p.model || "—"}</td>
                        <td className="p-3">
                          {p.hasKey ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <XCircle className="h-4 w-4 text-slate-600" />
                          )}
                        </td>
                        <td className="p-3 tabular-nums">{p.calls}</td>
                        <td className="p-3 tabular-nums">{p.failures}</td>
                        <td className="p-3 tabular-nums">{p.avgLatencyMs} ms</td>
                        <td className="p-3 text-[11px] text-slate-500">
                          {p.lastCheckedAt
                            ? new Date(p.lastCheckedAt).toLocaleString("ar-EG")
                            : "—"}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => test(p.type)}
                              disabled={busy !== null}
                              className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-white/10 disabled:opacity-50"
                            >
                              {busy === p.type ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "فحص"
                              )}
                            </button>
                            <button
                              onClick={() => toggle(p)}
                              disabled={busy !== null || p.type === "local"}
                              className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-white/10 disabled:opacity-40"
                            >
                              {p.enabled ? "تعطيل" : "تفعيل"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        {icon}
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-extrabold tabular-nums ${tone === "warn" ? "text-amber-300" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
