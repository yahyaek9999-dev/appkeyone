"use client";

// Platform Health strip for the Admin Command Center. Reuses the EXISTING
// admin-gated aggregator GET /api/system/health (no new backend). Renders one
// badge per real subsystem with its real verdict + detail, linking to the full
// /admin/system-health page. Fails soft: if the endpoint is unreachable it says
// so rather than showing a fake "healthy".

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, AlertCircle, Loader2 } from "lucide-react";

type SubsystemState = "ok" | "degraded" | "down" | "unknown";
type Subsystem = { status: SubsystemState; detail: string };

const LABELS: Record<string, string> = {
  database: "قاعدة البيانات",
  redis: "Redis",
  whatsapp: "واتساب",
  queue: "الطابور",
  aiProvider: "الذكاء الاصطناعي",
  worker: "العامل",
  bridgeGateway: "بوابة Bridge",
};

const DOT: Record<SubsystemState, string> = {
  ok: "bg-emerald-400",
  degraded: "bg-amber-400",
  down: "bg-rose-500",
  unknown: "bg-slate-600",
};

const RING: Record<SubsystemState, string> = {
  ok: "border-emerald-500/20",
  degraded: "border-amber-500/25",
  down: "border-rose-500/30",
  unknown: "border-white/[0.06]",
};

export default function PlatformHealthStrip() {
  const [subsystems, setSubsystems] = useState<Record<string, Subsystem> | null>(null);
  const [overall, setOverall] = useState<SubsystemState | null>(null);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch("/api/system/health", { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (!alive) return;
        setSubsystems(j.subsystems || {});
        setOverall(j.overall || null);
        setErr(false);
      } catch {
        if (alive) setErr(true);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="border-t border-white/[0.06] pt-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
          <Activity className="h-3.5 w-3.5" /> صحة المنصة
        </div>
        <Link href="/admin/system-health" className="text-[11px] text-brand-300 hover:text-brand-200">
          التفاصيل الكاملة →
        </Link>
      </div>

      {loading && (
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[12px] text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ قراءة حالة الأنظمة…
        </div>
      )}

      {!loading && err && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/[0.05] px-4 py-3 text-[12px] text-rose-200">
          <AlertCircle className="h-3.5 w-3.5" /> تعذّر قراءة حالة الأنظمة (نقطة /api/system/health غير متاحة).
        </div>
      )}

      {!loading && !err && subsystems && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(subsystems).map(([key, s]) => (
            <Link
              key={key}
              href="/admin/system-health"
              className={`flex items-center gap-2 rounded-xl border bg-white/[0.02] px-3 py-2.5 transition hover:bg-white/[0.04] ${RING[s.status]}`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[s.status]}`} />
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold text-white">{LABELS[key] || key}</div>
                <div className="truncate text-[10px] text-slate-500">{s.detail}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
