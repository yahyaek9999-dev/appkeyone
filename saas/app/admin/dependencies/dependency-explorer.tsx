"use client";

import { useMemo, useState } from "react";
import { Search, CheckCircle2, XCircle, ChevronDown, ArrowLeft } from "lucide-react";
import type { FeatureExplanation, ExplainFactor } from "@/lib/admin/feature-explain";

const VERDICT_DOT: Record<ExplainFactor["verdict"], string> = {
  ok: "bg-emerald-400",
  block: "bg-rose-500",
  info: "bg-slate-500",
};

export default function DependencyExplorer({ features }: { features: FeatureExplanation[] }) {
  const [q, setQ] = useState("");
  const [onlyBlocked, setOnlyBlocked] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return features.filter((f) => {
      if (onlyBlocked && f.available) return false;
      if (!query) return true;
      return f.name.toLowerCase().includes(query) || f.featureId.toLowerCase().includes(query);
    });
  }, [features, q, onlyBlocked]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث عن ميزة…"
            className="w-56 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none"
          />
        </div>
        <button
          onClick={() => setOnlyBlocked((v) => !v)}
          className={`rounded-lg border px-3 py-1.5 text-xs transition ${onlyBlocked ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-white"}`}
        >
          غير المتاحة فقط
        </button>
      </div>

      <div className="space-y-1.5">
        {filtered.length === 0 && <div className="py-8 text-center text-[12px] text-slate-600">لا نتائج.</div>}
        {filtered.map((f) => {
          const isOpen = open === f.featureId;
          return (
            <div key={f.featureId} className={`rounded-xl border ${f.available ? "border-white/[0.06]" : "border-rose-500/20"} bg-white/[0.02]`}>
              <button
                onClick={() => setOpen(isOpen ? null : f.featureId)}
                className="flex w-full items-center gap-3 px-4 py-3 text-right"
              >
                {f.available ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{f.name}</span>
                    <code className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-slate-500" dir="ltr">{f.featureId}</code>
                  </div>
                  {!f.available && f.reason && <div className="mt-0.5 text-[12px] text-rose-300">{f.reason}</div>}
                  {f.available && f.dependencies.length > 0 && (
                    <div className="mt-0.5 text-[11px] text-slate-500">{f.dependencies.length} اعتمادية</div>
                  )}
                </div>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${f.available ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>
                  {f.available ? "متاحة" : "غير متاحة"}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="border-t border-white/[0.06] px-4 py-3">
                  {/* Factors */}
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">العوامل</div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {f.factors.map((fac) => (
                      <div key={fac.key} className="flex items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${VERDICT_DOT[fac.verdict]}`} />
                        <div className="min-w-0">
                          <div className="text-[11px] text-slate-500">{fac.label}</div>
                          <div className="truncate text-[12px] font-medium text-white">{fac.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Dependency chain */}
                  {f.dependencies.length > 0 && (
                    <>
                      <div className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">سلسلة الاعتماديات</div>
                      <div className="space-y-1.5">
                        {f.dependencies.map((d) => (
                          <div key={d.featureId} className="flex items-center gap-2 text-[12px]">
                            <ArrowLeft className="h-3 w-3 text-slate-600" />
                            {d.available ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-rose-400" />}
                            <span className="text-white">{d.name}</span>
                            <code className="rounded bg-white/[0.05] px-1 py-0.5 text-[10px] text-slate-500" dir="ltr">{d.featureId}</code>
                            {!d.available && d.blockedBy && <span className="text-[11px] text-rose-300">← محجوبة بـ {d.blockedBy}</span>}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
