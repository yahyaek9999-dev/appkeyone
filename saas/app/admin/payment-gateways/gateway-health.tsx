"use client";

// Gateway health strip — real evidence only. Never renders "Healthy" without a
// success-rate computed from actual PaymentTransaction rows; below the sample
// threshold it says "not enough data". Shows SAFE metadata only (configured /
// not configured) — never credential or webhook secret values.

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, ShieldAlert, ShieldQuestion, Ban, Activity } from "lucide-react";

type Health = "healthy" | "degraded" | "failing" | "unverified" | "disabled" | "no_data";

type Row = {
  id: string; name: string; displayName: string; adapter: string; status: string;
  isDefault: boolean; testMode: boolean;
  credentialsConfigured: boolean; webhookConfigured: boolean;
  lastTestAt: string | null; lastTestOk: boolean | null; lastError: string | null;
  recentTotal: number; recentPaid: number; recentFailed: number;
  successRatePct: number | null;
  lastSuccessAt: string | null; lastFailureAt: string | null;
  health: Health;
};

const META: Record<Health, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  healthy:    { label: "سليمة",           cls: "border-emerald-500/25 bg-emerald-500/[0.05] text-emerald-300", icon: ShieldCheck },
  degraded:   { label: "متدهورة",         cls: "border-amber-500/25 bg-amber-500/[0.05] text-amber-300",       icon: ShieldAlert },
  failing:    { label: "فاشلة",           cls: "border-rose-500/30 bg-rose-500/[0.05] text-rose-300",          icon: ShieldAlert },
  unverified: { label: "غير مُتحقّق منها", cls: "border-sky-500/25 bg-sky-500/[0.05] text-sky-300",             icon: ShieldQuestion },
  disabled:   { label: "معطّلة",           cls: "border-white/[0.08] bg-white/[0.02] text-slate-400",           icon: Ban },
  no_data:    { label: "بيانات غير كافية", cls: "border-white/[0.08] bg-white/[0.02] text-slate-500",           icon: ShieldQuestion },
};

export default function GatewayHealth() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/admin/finance/gateways", { cache: "no-store" });
        if (!r.ok) throw new Error();
        const j = await r.json();
        if (alive) setRows(j.gateways || []);
      } catch {
        if (alive) setErr(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (err) {
    return (
      <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.05] px-4 py-3 text-[12px] text-rose-200">
        تعذّر قراءة حالة البوابات.
      </div>
    );
  }
  if (!rows) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[12px] text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ قراءة صحة البوابات…
      </div>
    );
  }
  if (rows.length === 0) {
    return <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center text-[12px] text-slate-500">لا بوابات مُهيّأة.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        <Activity className="h-3.5 w-3.5" /> صحة البوابات (آخر ٣٠ يوم — من المعاملات الفعلية)
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((g) => {
          const m = META[g.health];
          const Icon = m.icon;
          return (
            <div key={g.id} className={`rounded-xl border p-3 ${m.cls}`}>
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate text-sm font-semibold text-white">{g.displayName}</span>
                {g.isDefault && <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[9px] text-slate-300">افتراضية</span>}
                {g.testMode && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-300">اختبار</span>}
                <span className="ms-auto shrink-0 text-[11px] font-medium">{m.label}</span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-400">
                <span>المحوّل: <b className="text-slate-200" dir="ltr">{g.adapter}</b></span>
                <span>
                  نجاح:{" "}
                  {g.successRatePct != null ? <b className="text-slate-200">{g.successRatePct}%</b> : <span className="text-slate-600">بيانات غير كافية</span>}
                </span>
                <span>ناجحة: <b className="text-emerald-300">{g.recentPaid}</b></span>
                <span>فاشلة: <b className="text-rose-300">{g.recentFailed}</b></span>
                <span>بيانات الاعتماد: {g.credentialsConfigured ? <b className="text-emerald-300">مُهيّأة</b> : <b className="text-slate-500">غير مُهيّأة</b>}</span>
                <span>Webhook: {g.webhookConfigured ? <b className="text-emerald-300">مُهيّأ</b> : <b className="text-slate-500">غير مُهيّأ</b>}</span>
              </div>

              {g.lastSuccessAt && (
                <div className="mt-1.5 text-[10px] text-slate-500">آخر نجاح: {new Date(g.lastSuccessAt).toLocaleString("ar-EG")}</div>
              )}
              {g.lastError && <div className="mt-1 truncate text-[10px] text-rose-300">آخر خطأ: {g.lastError}</div>}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-600">
        لا تُعرض «سليمة» إلا بوجود ٥ معاملات محسومة على الأقل. لا تُعرض أي أسرار أو مفاتيح — فقط حالة التهيئة.
      </p>
    </div>
  );
}
