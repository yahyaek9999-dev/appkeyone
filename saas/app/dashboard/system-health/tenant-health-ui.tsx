"use client";

/**
 * Tenant-scoped health — what a merchant can actually act on.
 *
 * The previous screen on this route rendered the PLATFORM view: host CPU model,
 * memory, heap/RSS, process uptime, database file size and cross-tenant message
 * and customer totals. Its endpoint is admin-only for exactly that reason, so
 * the page answered every customer with a 403 that the UI then reported as an
 * expired session. A merchant bought `system_health` and could never see one
 * number.
 *
 * This renders /api/system/health/me: connection, numbers, delivery, store
 * integrations, automations, assistant — each with a plain-Arabic summary and,
 * where something is wrong, a link to the screen that fixes it. No server
 * internals appear here by design.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity, RefreshCw, Smartphone, Phone, Send, Plug, Zap, Brain,
  CheckCircle2, AlertTriangle, XCircle, MinusCircle, Wifi,
} from "lucide-react";

type Level = "ok" | "warn" | "down" | "idle";

interface Section {
  level: Level;
  summary: string;
  [k: string]: any;
}

interface Health {
  ok: boolean;
  checkedAt: string;
  overall: Level;
  messages24h: number;
  sections: Record<string, Section>;
}

type LoadError =
  | { kind: "auth" }
  | { kind: "locked" }
  | { kind: "network" }
  | { kind: "server"; detail?: string };

const LEVEL_STYLE: Record<Level, { chip: string; icon: React.ReactNode; label: string }> = {
  ok:   { chip: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200", icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />, label: "سليم" },
  warn: { chip: "border-amber-500/25 bg-amber-500/10 text-amber-200",       icon: <AlertTriangle className="h-4 w-4 text-amber-400" />,  label: "يحتاج انتباه" },
  down: { chip: "border-rose-500/25 bg-rose-500/10 text-rose-200",          icon: <XCircle className="h-4 w-4 text-rose-400" />,         label: "متوقف" },
  idle: { chip: "border-white/10 bg-white/[0.03] text-slate-300",           icon: <MinusCircle className="h-4 w-4 text-slate-500" />,    label: "غير مُفعّل" },
};

/** Where the merchant goes to fix each area. Every target is a real customer destination. */
const FIX: Record<string, { href: string; cta: string }> = {
  connection:   { href: "/dashboard/settings/bridge",  cta: "اربط واتساب" },
  numbers:      { href: "/dashboard/settings/numbers", cta: "إدارة الأرقام" },
  delivery:     { href: "/dashboard/broadcasts",       cta: "عرض الحملات" },
  integrations: { href: "/dashboard/integrations",     cta: "إدارة التكاملات" },
  automations:  { href: "/dashboard/automations",      cta: "إعداد الأتمتة" },
  assistant:    { href: "/dashboard/settings/providers", cta: "مزوّدو الخدمة" },
};

const META: Record<string, { title: string; icon: React.ReactNode }> = {
  connection:   { title: "اتصال واتساب",   icon: <Smartphone className="h-4 w-4" /> },
  numbers:      { title: "أرقامك",          icon: <Phone className="h-4 w-4" /> },
  delivery:     { title: "تسليم الرسائل",   icon: <Send className="h-4 w-4" /> },
  integrations: { title: "المتاجر المربوطة", icon: <Plug className="h-4 w-4" /> },
  automations:  { title: "الأتمتة",         icon: <Zap className="h-4 w-4" /> },
  assistant:    { title: "المساعد الذكي",   icon: <Brain className="h-4 w-4" /> },
};

const ORDER = ["connection", "numbers", "delivery", "integrations", "automations", "assistant"];

export default function TenantHealthUi() {
  const [data, setData] = useState<Health | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/system/health/me", { cache: "no-store" });
      // Each status means something different to the customer — see
      // __tests__/http-status-honesty.test.ts for why these must not share a branch.
      if (r.status === 401) { setError({ kind: "auth" }); setData(null); return; }
      if (r.status === 402) { setError({ kind: "locked" }); setData(null); return; }
      if (!r.ok) { setError({ kind: "server", detail: `${r.status}` }); setData(null); return; }
      setData(await r.json());
      setError(null);
    } catch {
      setError({ kind: "network" });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !data && !error) {
    return (
      <div className="space-y-6">
        <Header onRefresh={load} refreshing />
        <div className="grid gap-3 sm:grid-cols-2">
          {ORDER.map((k) => (
            <div key={k} className="card animate-pulse p-5">
              <div className="mb-3 h-4 w-28 rounded bg-white/[0.06]" />
              <div className="h-3 w-44 rounded bg-white/[0.04]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    const copy = {
      auth:    { title: "انتهت الجلسة", desc: "سجّل الدخول مرة أخرى لعرض حالة حسابك.", cta: "تسجيل الدخول", href: "/login" },
      locked:  { title: "هذه الميزة غير متاحة في باقتك", desc: "متابعة حالة حسابك متاحة في باقة Pro فأعلى.", cta: "عرض الباقات", href: "/pricing?lang=ar#plans" },
      network: { title: "تعذّر الاتصال", desc: "لم نتمكن من الوصول للخادم. تحقّق من اتصالك ثم أعد المحاولة.", cta: null, href: null },
      server:  { title: "تعذّر تحميل الحالة", desc: "حدث خطأ مؤقت أثناء فحص حسابك. عادةً ما يُحل بإعادة المحاولة.", cta: null, href: null },
    }[error.kind];

    return (
      <div className="space-y-6">
        <Header onRefresh={load} refreshing={false} />
        <div className="card p-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10">
            <Wifi className="h-6 w-6 text-amber-400" />
          </div>
          <h3 className="text-base font-semibold text-white">{copy.title}</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">{copy.desc}</p>
          <div className="mt-5">
            {copy.cta && copy.href ? (
              <Link href={copy.href} className="btn-primary text-sm">{copy.cta}</Link>
            ) : (
              <button onClick={load} className="btn-primary inline-flex items-center gap-2 text-sm">
                <RefreshCw className="h-4 w-4" /> إعادة المحاولة
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const overall = LEVEL_STYLE[data.overall];

  return (
    <div className="space-y-6">
      <Header onRefresh={load} refreshing={loading} />

      <div className={`card flex flex-wrap items-center justify-between gap-3 border p-5 ${overall.chip}`}>
        <div className="flex items-center gap-3">
          {overall.icon}
          <div>
            <div className="font-semibold">
              {data.overall === "ok"
                ? "حسابك يعمل بشكل سليم"
                : data.overall === "warn"
                  ? "حسابك يعمل مع تنبيهات"
                  : "يوجد ما يمنع حسابك من العمل"}
            </div>
            <div className="mt-0.5 text-xs opacity-80">
              {data.messages24h.toLocaleString("ar-EG")} رسالة خلال آخر ٢٤ ساعة
            </div>
          </div>
        </div>
        <div className="text-xs opacity-70">
          آخر فحص: {new Date(data.checkedAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ORDER.filter((k) => data.sections[k]).map((key) => {
          const s = data.sections[key];
          const style = LEVEL_STYLE[s.level];
          const fix = FIX[key];
          // Offer the fix link when something needs doing, not on a healthy row —
          // a card that is fine should not nag.
          const showFix = s.level !== "ok" && fix;
          return (
            <div key={key} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 font-medium text-slate-200">
                  {META[key].icon} {META[key].title}
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${style.chip}`}>
                  {style.icon} {style.label}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.summary}</p>

              {Array.isArray(s.items) && s.items.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {s.items.slice(0, 4).map((it: any) => (
                    <li key={it.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-slate-300">{it.name}</span>
                      <span className="shrink-0 text-slate-500">{it.status}</span>
                    </li>
                  ))}
                </ul>
              )}

              {showFix && (
                <div className="mt-4">
                  <Link href={fix.href} className="text-xs font-medium text-brand-300 underline hover:text-brand-200">
                    {fix.cta}
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Header({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.05] pb-5">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Activity className="h-5 w-5" /> صحة حسابك
        </h1>
        <p className="page-desc mt-1">
          حالة اتصالك وأرقامك وتسليم رسائلك وتكاملاتك — يُحدَّث تلقائيًا كل ٣٠ ثانية.
        </p>
      </div>
      <button onClick={onRefresh} disabled={refreshing} className="btn-secondary inline-flex items-center gap-2 text-sm">
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> تحديث
      </button>
    </div>
  );
}
