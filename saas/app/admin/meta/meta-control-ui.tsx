"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Wallet,
  Users,
  Activity,
  DollarSign,
  Coins,
  Settings2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Power,
  HeartPulse,
  Bell,
  Download,
  TrendingUp,
  ShieldAlert,
} from "lucide-react";
import { Sparkline } from "@/components/ui/sparkline";

type Tenant = {
  userId: string;
  email: string;
  name: string | null;
  planSlug: string | null;
  planName: string | null;
  metaAccess: "none" | "limited" | "full";
  status: string;
  healthStatus: string;
  qualityRating: string | null;
  connectionStatus: string;
  balanceUsd: number;
  pendingConversations: number;
};
type Summary = {
  totalTenants: number;
  provisioned: number;
  enabled: number;
  totalBalanceUsd: number;
  totalPendingConversations: number;
  totalChargedEgp: number;
  ratesConfigured: number;
  limitsConfigured: number;
};
type ListResp = { ok: boolean; summary: Summary; tenants: Tenant[] };

const STATUSES = [
  "pending",
  "enabled",
  "disabled",
  "suspended",
  "expired",
  "blocked",
  "maintenance",
];
const STATUS_AR: Record<string, string> = {
  not_provisioned: "غير مُهيّأ",
  pending: "بانتظار",
  enabled: "مُفعّل",
  disabled: "مُعطّل",
  suspended: "موقوف",
  expired: "منتهٍ",
  blocked: "محظور",
  maintenance: "صيانة",
};
const ACCESS_AR: Record<string, string> = { none: "لا يوجد", limited: "محدود", full: "كامل" };

function statusCls(s: string) {
  if (s === "enabled") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (s === "suspended" || s === "blocked" || s === "expired")
    return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  if (s === "maintenance" || s === "disabled")
    return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  return "bg-white/5 text-slate-400 border-white/10";
}
function accessCls(a: string) {
  if (a === "full") return "bg-emerald-500/15 text-emerald-300";
  if (a === "limited") return "bg-sky-500/15 text-sky-300";
  return "bg-white/5 text-slate-500";
}
const SEV_AR: Record<string, string> = {
  low: "منخفض",
  medium: "متوسط",
  high: "مرتفع",
  critical: "حرج",
};
const STATUS_AR_INC: Record<string, string> = {
  open: "مفتوحة",
  acknowledged: "مُستلمة",
  resolved: "محلولة",
  auto_resolved: "محلولة تلقائياً",
};
function sevCls(s: string) {
  if (s === "critical") return "bg-rose-600/20 text-rose-300 border-rose-600/40";
  if (s === "high") return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  if (s === "medium") return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  return "bg-sky-500/15 text-sky-300 border-sky-500/30";
}

export default function MetaControlUi() {
  const [data, setData] = useState<ListResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [creditFor, setCreditFor] = useState<Tenant | null>(null);
  const [creditAmt, setCreditAmt] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [analytics, setAnalytics] = useState<any | null>(null);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, an, inc, prov] = await Promise.all([
        fetch("/api/admin/meta", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/admin/meta/analytics?days=30", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null),
        fetch("/api/admin/meta/incidents", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null),
        fetch("/api/admin/meta/providers", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null),
      ]);
      if (list.ok) setData(list as ListResp);
      if (an?.ok) setAnalytics(an.analytics);
      if (inc?.ok) setIncidents(inc.incidents);
      if (prov?.ok) setProviders(prov.providers);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function healthSweep() {
    setBusy("sweep");
    try {
      const r = await fetch("/api/admin/meta/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (r.ok) {
        flash("ok", `فحص ${j.checked} عميل — ${j.incidentsOpened} حادثة جديدة`);
        load();
      } else flash("err", j.error || "فشل");
    } finally {
      setBusy(null);
    }
  }

  async function incidentAction(id: string, action: string) {
    setBusy("inc" + id);
    try {
      const r = await fetch("/api/admin/meta/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const j = await r.json();
      if (r.ok) {
        flash("ok", "تم");
        load();
      } else flash("err", j.error || "فشل");
    } finally {
      setBusy(null);
    }
  }

  function flash(kind: "ok" | "err", text: string) {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  }

  async function initDefaults() {
    setBusy("init");
    try {
      const r = await fetch("/api/admin/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "init" }),
      });
      const j = await r.json();
      if (r.ok) {
        flash("ok", `تمت التهيئة: ${j.seeded.rates} سعر، ${j.seeded.limits} حد`);
        load();
      } else flash("err", j.error || "فشل");
    } finally {
      setBusy(null);
    }
  }

  async function act(userId: string, body: any, label: string) {
    setBusy(userId + label);
    try {
      const r = await fetch(`/api/admin/meta/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (r.ok && (j.ok ?? true)) {
        flash("ok", "تم التنفيذ ✓");
        await load();
        if (expanded === userId) openDetail(userId);
      } else flash("err", j.error || "فشل");
      return j;
    } finally {
      setBusy(null);
    }
  }

  async function submitCredit() {
    if (!creditFor) return;
    const amt = parseInt(creditAmt, 10);
    if (!Number.isInteger(amt) || amt === 0) {
      flash("err", "أدخل مبلغًا صحيحًا (موجب لمنح، سالب لخصم)");
      return;
    }
    const j = await act(
      creditFor.userId,
      { action: "credit", amountUsd: amt, note: creditNote || undefined },
      "credit",
    );
    if (j?.ok) {
      setCreditFor(null);
      setCreditAmt("");
      setCreditNote("");
      flash("ok", `الرصيد الجديد: $${Number(j.balance).toFixed(2)}`);
    }
  }

  async function openDetail(userId: string) {
    if (expanded === userId) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(userId);
    setDetail(null);
    const j = await fetch(`/api/admin/meta/${userId}`, { cache: "no-store" }).then((r) => r.json());
    if (j.ok) setDetail(j);
  }

  if (loading && !data)
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  const s = data?.summary;

  return (
    <div className="space-y-5">
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm shadow-lg border ${toast.kind === "ok" ? "bg-emerald-600/90 border-emerald-400/40 text-white" : "bg-rose-600/90 border-rose-400/40 text-white"}`}
        >
          {toast.text}
        </div>
      )}

      {/* Summary */}
      {s && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi
            icon={<Users className="h-4 w-4 text-brand-300" />}
            label="عملاء مُهيّؤون"
            value={`${s.provisioned}/${s.totalTenants}`}
          />
          <Kpi
            icon={<Power className="h-4 w-4 text-emerald-300" />}
            label="مُفعّل"
            value={s.enabled}
          />
          <Kpi
            icon={<Wallet className="h-4 w-4 text-emerald-300" />}
            label="إجمالي الأرصدة"
            value={`$${s.totalBalanceUsd.toFixed(2)}`}
          />
          <Kpi
            icon={<Activity className="h-4 w-4 text-amber-300" />}
            label="محادثات معلّقة"
            value={s.totalPendingConversations}
            tone={s.totalPendingConversations > 0 ? "warn" : undefined}
          />
          <Kpi
            icon={<DollarSign className="h-4 w-4 text-sky-300" />}
            label="إجمالي المحصّل"
            value={`${s.totalChargedEgp.toLocaleString()} ج.م`}
          />
          <Kpi
            icon={<Coins className="h-4 w-4 text-violet-300" />}
            label="الأسعار/الحدود"
            value={`${s.ratesConfigured}/${s.limitsConfigured}`}
          />
        </div>
      )}

      {/* Init banner */}
      {s && s.ratesConfigured === 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-amber-100 inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> لم تُهيّأ أسعار Meta والحدود بعد. اضغط للتهيئة
            بالقيم الافتراضية (قابلة للتعديل لاحقًا).
          </div>
          <button
            onClick={initDefaults}
            disabled={busy === "init"}
            className="px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-100 text-sm font-medium hover:bg-amber-500/30 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {busy === "init" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Settings2 className="h-4 w-4" />
            )}{" "}
            تهيئة الأسعار والحدود
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={healthSweep}
          disabled={busy === "sweep"}
          className="px-3 py-1.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-200 text-sm hover:bg-sky-500/25 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {busy === "sweep" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <HeartPulse className="h-4 w-4" />
          )}{" "}
          فحص الصحة للكل
        </button>
        <a
          href="/api/admin/meta/analytics?days=30&format=csv"
          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10 inline-flex items-center gap-1.5"
        >
          <Download className="h-4 w-4" /> تصدير التحليلات CSV
        </a>
      </div>

      {/* Analytics */}
      {analytics && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
          <h2 className="font-bold text-sm inline-flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-300" /> تحليلات Meta (آخر {analytics.days}{" "}
            يوم)
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi
              icon={<Activity className="h-4 w-4 text-sky-300" />}
              label="محادثات"
              value={analytics.totals.conversations}
            />
            <Kpi
              icon={<DollarSign className="h-4 w-4 text-amber-300" />}
              label="تكلفة"
              value={"$" + (analytics.totals.costMicroUsd / 1e6).toFixed(2)}
            />
            <Kpi
              icon={<DollarSign className="h-4 w-4 text-emerald-300" />}
              label="ربح"
              value={"$" + (analytics.totals.revenueMicroUsd / 1e6).toFixed(2)}
            />
            <Kpi
              icon={<Bell className="h-4 w-4 text-rose-300" />}
              label="حوادث مفتوحة"
              value={analytics.openIncidents}
              tone={analytics.openIncidents > 0 ? "warn" : undefined}
            />
          </div>
          {analytics.trend.length > 1 && (
            <div>
              <div className="text-[11px] text-slate-400 mb-1">اتجاه المحادثات</div>
              <Sparkline
                data={analytics.trend.map((t: any) => t.conversations)}
                tone="positive"
                height={40}
              />
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            <MiniTable
              title="أعلى العملاء تكلفة"
              head={["العميل", "محادثات", "التكلفة"]}
              rows={analytics.topCustomers.map((c: any) => [
                c.name,
                c.conversations,
                "$" + (c.chargedMicroUsd / 1e6).toFixed(2),
              ])}
              empty="لا يوجد."
            />
            <MiniTable
              title="حسب الفئة"
              head={["الفئة", "محادثات", "التكلفة"]}
              rows={analytics.byCategory.map((c: any) => [
                c.category,
                c.conversations,
                "$" + (c.chargedMicroUsd / 1e6).toFixed(2),
              ])}
              empty="لا يوجد."
            />
          </div>
        </section>
      )}

      {/* Incident center */}
      <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="border-b border-white/10 p-3 font-bold text-sm inline-flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-300" /> مركز الحوادث (
          {incidents.filter((i) => i.status === "open" || i.status === "acknowledged").length}{" "}
          مفتوحة)
        </div>
        <div className="divide-y divide-white/5">
          {incidents.length === 0 ? (
            <div className="p-6 text-center text-sm text-emerald-200 inline-flex items-center gap-2 w-full justify-center">
              <CheckCircle2 className="h-4 w-4" /> لا توجد حوادث.
            </div>
          ) : (
            incidents.slice(0, 20).map((i) => (
              <div key={i.id} className="p-3 flex flex-wrap items-start justify-between gap-2">
                <div className="flex-1 min-w-[220px]">
                  <div className="text-sm font-medium inline-flex items-center gap-2">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full border ${sevCls(i.severity)}`}
                    >
                      {SEV_AR[i.severity] || i.severity}
                    </span>
                    {i.title}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {i.detail} · {STATUS_AR_INC[i.status] || i.status} ·{" "}
                    {new Date(i.createdAt).toLocaleString("ar-EG")}
                  </div>
                </div>
                {(i.status === "open" || i.status === "acknowledged") && (
                  <div className="flex gap-1.5">
                    {i.status === "open" && (
                      <button
                        onClick={() => incidentAction(i.id, "ack")}
                        disabled={busy === "inc" + i.id}
                        className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-white/10 disabled:opacity-40"
                      >
                        استلام
                      </button>
                    )}
                    <button
                      onClick={() => incidentAction(i.id, "escalate")}
                      disabled={busy === "inc" + i.id}
                      className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs hover:bg-amber-500/20 disabled:opacity-40"
                    >
                      تصعيد
                    </button>
                    <button
                      onClick={() => incidentAction(i.id, "resolve")}
                      disabled={busy === "inc" + i.id}
                      className="px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs hover:bg-emerald-500/25 disabled:opacity-40"
                    >
                      حل
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Provider registry */}
      {providers.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="border-b border-white/10 p-3 font-bold text-sm inline-flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-violet-300" /> مزوّدات Meta (Provider Registry +
            Failover)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[360px]">
              <thead className="bg-white/5 text-slate-400">
                <tr>
                  <th className="text-right p-3">المزوّد</th>
                  <th className="text-right p-3">الأولوية</th>
                  <th className="text-right p-3">قادر على الإرسال</th>
                  <th className="text-right p-3">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => (
                  <tr key={p.id} className="border-t border-white/5">
                    <td className="p-3">{p.label}</td>
                    <td className="p-3 tabular-nums">{p.priority}</td>
                    <td className="p-3">{p.sendCapable ? "✓" : "—"}</td>
                    <td className="p-3">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full border ${p.implemented ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-white/5 text-slate-400 border-white/10"}`}
                      >
                        {p.implemented ? "مُفعّل" : "جاهز للإعداد"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tenants table */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="border-b border-white/10 p-3 font-bold text-sm">
          العملاء ({data?.tenants.length ?? 0})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-white/5 text-slate-400">
              <tr>
                <th className="text-right p-3">العميل</th>
                <th className="text-right p-3">الباقة / وصول Meta</th>
                <th className="text-right p-3">الحالة</th>
                <th className="text-right p-3">الرصيد</th>
                <th className="text-right p-3">معلّق</th>
                <th className="text-right p-3">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {data?.tenants.map((t) => (
                <Fragment key={t.userId}>
                  <tr className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="p-3">
                      <button
                        onClick={() => openDetail(t.userId)}
                        className="inline-flex items-center gap-1.5 hover:text-white"
                      >
                        {expanded === t.userId ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        <span className="font-medium">{t.name || t.email}</span>
                      </button>
                      <div className="text-[11px] text-slate-500">{t.email}</div>
                    </td>
                    <td className="p-3">
                      <div className="text-xs text-slate-300">{t.planName || "—"}</div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${accessCls(t.metaAccess)}`}
                      >
                        Meta: {ACCESS_AR[t.metaAccess]}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full border ${statusCls(t.status)}`}
                      >
                        {STATUS_AR[t.status] || t.status}
                      </span>
                    </td>
                    <td className="p-3 tabular-nums">
                      ${t.balanceUsd.toFixed(2)}{" "}
                      <span className="text-[10px] text-slate-500">USD</span>
                    </td>
                    <td className="p-3 tabular-nums">
                      {t.pendingConversations > 0 ? (
                        <span className="text-amber-300">{t.pendingConversations}</span>
                      ) : (
                        <span className="text-slate-500">0</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => {
                            setCreditFor(t);
                            setCreditAmt("");
                            setCreditNote("");
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs hover:bg-emerald-500/25"
                        >
                          منح رصيد
                        </button>
                        <button
                          onClick={() => act(t.userId, { action: "settle" }, "settle")}
                          disabled={busy === t.userId + "settle" || t.pendingConversations === 0}
                          className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-white/10 disabled:opacity-40"
                        >
                          تسوية
                        </button>
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value)
                              act(t.userId, { action: "status", status: e.target.value }, "status");
                          }}
                          className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs"
                        >
                          <option value="">الحالة…</option>
                          {STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {STATUS_AR[st]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                  {expanded === t.userId && (
                    <tr className="bg-black/20">
                      <td colSpan={6} className="p-4">
                        {!detail ? (
                          <div className="flex justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                          </div>
                        ) : (
                          <DetailPanel
                            detail={detail}
                            onAct={(b, l) => act(t.userId, b, l)}
                            busyKey={busy}
                            userId={t.userId}
                          />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {data?.tenants.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500 text-xs">
                    لا يوجد عملاء.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grant credit modal */}
      {creditFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setCreditFor(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-base inline-flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-300" /> منح رصيد Meta
            </h3>
            <p className="text-xs text-slate-400">
              {creditFor.name || creditFor.email} — الرصيد الحالي{" "}
              ${creditFor.balanceUsd.toFixed(2)}
            </p>
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                المبلغ ($) — موجب لمنح، سالب لخصم
              </label>
              <input
                value={creditAmt}
                onChange={(e) => setCreditAmt(e.target.value)}
                inputMode="numeric"
                placeholder="مثال: 500"
                dir="ltr"
                className="input px-3 py-2 text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">ملاحظة (اختياري)</label>
              <input
                value={creditNote}
                onChange={(e) => setCreditNote(e.target.value)}
                placeholder="سبب المنح…"
                className="input px-3 py-2 text-sm w-full"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={submitCredit}
                disabled={busy === creditFor.userId + "credit"}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2"
              >
                {busy === creditFor.userId + "credit" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}{" "}
                تأكيد
              </button>
              <button
                onClick={() => setCreditFor(null)}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailPanel({
  detail,
  onAct,
  busyKey,
  userId,
}: {
  detail: any;
  onAct: (b: any, l: string) => void;
  busyKey: string | null;
  userId: string;
}) {
  const snap = detail.snapshot;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onAct({ action: "derive", days: 7 }, "derive")}
          disabled={busyKey === userId + "derive"}
          className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-white/10 disabled:opacity-40"
        >
          اشتقاق المحادثات من السجل (٧ أيام)
        </button>
        <button
          onClick={() => onAct({ action: "rollup" }, "rollup")}
          disabled={busyKey === userId + "rollup"}
          className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-white/10 disabled:opacity-40"
        >
          إعادة حساب الاستخدام/الفاتورة
        </button>
        <button
          onClick={() => {
            const t = window.prompt("الصق رمز الوصول الجديد (Access Token):");
            if (t && t.trim().length >= 10)
              onAct({ action: "rotate_token", token: t.trim() }, "rotate");
          }}
          className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs hover:bg-amber-500/20"
        >
          تدوير الرمز
        </button>
        <button
          onClick={() => {
            if (window.confirm("إعادة ضبط رمز التحقق للـ Webhook؟ سيتولّد رمز جديد."))
              onAct({ action: "reset_webhook" }, "webhook");
          }}
          className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-white/10"
        >
          إعادة ضبط Webhook
        </button>
        <button
          onClick={() => {
            const id = window.prompt("Phone Number ID للرقم الجديد:");
            if (id && id.trim())
              onAct({ action: "add_phone", phoneNumberId: id.trim() }, "addphone");
          }}
          className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs hover:bg-emerald-500/20"
        >
          + رقم
        </button>
        <button
          onClick={() => onAct({ action: "health" }, "health")}
          disabled={busyKey === userId + "health"}
          className="px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-200 text-xs hover:bg-sky-500/20 disabled:opacity-40"
        >
          فحص الصحة
        </button>
      </div>
      {detail.incidents && detail.incidents.length > 0 && (
        <MiniTable
          title={`حوادث هذا العميل (${detail.incidents.length})`}
          head={["الخطورة", "العنوان", "الحالة"]}
          rows={detail.incidents.map((i: any) => [i.severity, i.title, i.status])}
          empty=""
        />
      )}
      {detail.phones && detail.phones.length > 0 && (
        <MiniTable
          title={`الأرقام (${detail.phones.length})`}
          head={["الرقم", "أساسي", "الحالة", "إجراء"]}
          rows={detail.phones.map((p: any) => [
            p.displayPhone || p.phoneNumberId,
            p.isPrimary ? "✓" : "—",
            p.status,
            "remove:" + p.id,
          ])}
          empty=""
          renderCell={(c: string) =>
            c.startsWith("remove:") ? (
              <button
                onClick={() => {
                  if (window.confirm("حذف هذا الرقم؟"))
                    onAct({ action: "remove_phone", phoneId: c.slice(7) }, "rmphone");
                }}
                className="text-rose-300 hover:underline"
              >
                حذف
              </button>
            ) : (
              String(c)
            )
          }
        />
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <MiniCard title="الرصيد" value={`$${snap.balanceUsd.toFixed(2)}`} />
        <MiniCard title="محادثات معلّقة" value={snap.pendingConversations} />
        <MiniCard
          title="آخر مزامنة"
          value={
            snap.tenant?.lastSyncAt ? new Date(snap.tenant.lastSyncAt).toLocaleString("ar-EG") : "—"
          }
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <MiniTable
          title={`أحدث المحادثات (${snap.recentConversations.length})`}
          head={["الفئة", "الدولة", "التكلفة µ$", "الحالة"]}
          rows={snap.recentConversations
            .slice(0, 8)
            .map((c: any) => [c.category, c.country, c.chargedMicroUsd, c.billingStatus])}
          empty="لا توجد محادثات."
        />
        <MiniTable
          title={`أحدث الحركات المالية (${snap.recentTransactions.length})`}
          head={["النوع", "ج.م", "ملاحظة", "التاريخ"]}
          rows={snap.recentTransactions
            .slice(0, 8)
            .map((tx: any) => [
              tx.kind,
              tx.amountEgp,
              tx.note || "—",
              new Date(tx.createdAt).toLocaleDateString("ar-EG"),
            ])}
          empty="لا توجد حركات."
        />
      </div>
      <MiniTable
        title={`سجل التدقيق (${detail.audits.length})`}
        head={["الإجراء", "بواسطة", "التاريخ"]}
        rows={detail.audits
          .slice(0, 8)
          .map((a: any) => [
            a.action,
            a.actorId || a.actorRole,
            new Date(a.createdAt).toLocaleString("ar-EG"),
          ])}
        empty="لا يوجد."
      />
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
  value: string | number;
  tone?: "warn";
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
        {icon}
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-extrabold tabular-nums ${tone === "warn" ? "text-amber-300" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
function MiniCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-[11px] text-slate-400">{title}</div>
      <div className="mt-0.5 font-bold tabular-nums">{value}</div>
    </div>
  );
}
function MiniTable({
  title,
  head,
  rows,
  empty,
  renderCell,
}: {
  title: string;
  head: string[];
  rows: any[][];
  empty: string;
  renderCell?: (cell: any, rowIndex: number, colIndex: number) => React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="border-b border-white/10 p-2 text-xs font-bold text-slate-300">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] min-w-[280px]">
          <thead className="text-slate-500">
            <tr>
              {head.map((h) => (
                <th key={h} className="text-right p-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={head.length} className="p-3 text-center text-slate-500">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i} className="border-t border-white/5">
                  {r.map((c, j) => (
                    <td key={j} className="p-2 tabular-nums">
                      {renderCell ? renderCell(c, i, j) : String(c)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
