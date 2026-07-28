"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Wallet,
  MessageSquare,
  Activity,
  DollarSign,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Plus,
  Settings2,
  HeartPulse,
} from "lucide-react";
import { Sparkline } from "@/components/ui/sparkline";
import { useToast } from "@/components/ui/toast";

type Snap = {
  balanceUsd: number;
  tenant: any | null;
  pendingConversations: number;
  pendingChargedMicroUsd: number;
  recentConversations: any[];
  recentTransactions: any[];
  usage: any[];
};
type Resp = {
  ok: boolean;
  eligibility: { allowed: boolean; reason: string; access: string };
  snapshot: Snap;
  invoices: any[];
  phones: any[];
  incidents: any[];
  bot: any;
};

const REASON_AR: Record<string, string> = {
  ok: "متصل ومؤهّل",
  global_disabled: "Meta غير مُفعّل على المنصّة حالياً",
  plan_blocked: "باقتك لا تشمل واتساب الرسمي (Meta) — قم بالترقية",
  mode_not_meta: "لم تُفعّل وضع Meta Cloud في الإعدادات",
  missing_token: "لم تُدخل رمز الوصول (Access Token) بعد",
};
const ACCESS_AR: Record<string, string> = { none: "لا يوجد", limited: "محدود", full: "كامل" };

function microUsd(v: number) {
  return "$" + (v / 1_000_000).toFixed(4);
}

export default function MetaCenterUi() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = (await fetch("/api/meta/me", { cache: "no-store" }).then((r) => r.json())) as Resp;
      if (j.ok) setData(j);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    try {
      const r = await fetch("/api/meta/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      if (!r.ok) { toast.error("فشل تحديث بيانات Meta"); return; }
      await load();
      toast.success("تم تحديث بيانات Meta");
    } catch {
      toast.error("خطأ في الاتصال");
    } finally {
      setRefreshing(false);
    }
  }

  async function checkHealth() {
    setRefreshing(true);
    try {
      const r = await fetch("/api/meta/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "health" }),
      });
      if (!r.ok) { toast.error("فشل فحص الصحة"); return; }
      await load();
      toast.success("تم فحص الصحة وتحديث البيانات");
    } catch {
      toast.error("خطأ في الاتصال");
    } finally {
      setRefreshing(false);
    }
  }

  if (loading && !data)
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  if (!data) return <div className="text-center text-slate-400 py-12">تعذّر تحميل البيانات.</div>;

  const s = data.snapshot;
  const el = data.eligibility;
  const trend = [...data.snapshot.usage].reverse().map((u) => u.conversations);
  const monthCost = data.snapshot.usage.reduce((acc, u) => acc + (u.chargedMicroUsd || 0), 0);
  const monthConvs = data.snapshot.usage.reduce((acc, u) => acc + (u.conversations || 0), 0);

  return (
    <div className="space-y-5">
      {/* Eligibility / connection banner */}
      <div
        className={`rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3 ${el.allowed ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-amber-500/30 bg-amber-500/[0.06]"}`}
      >
        <div className="flex items-center gap-2 text-sm">
          {el.allowed ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-300" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-300" />
          )}
          <div>
            <div
              className={el.allowed ? "text-emerald-100 font-medium" : "text-amber-100 font-medium"}
            >
              {REASON_AR[el.reason] || el.reason}
            </div>
            <div className="text-[11px] text-slate-400">
              مستوى وصول الباقة لـ Meta: {ACCESS_AR[el.access] || el.access}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/settings/meta-cloud"
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-white/10 inline-flex items-center gap-1.5"
          >
            <Settings2 className="h-3.5 w-3.5" /> إدارة الاتصال
          </Link>
          <button
            onClick={checkHealth}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-100 text-xs hover:bg-sky-500/25 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <HeartPulse className="h-3.5 w-3.5" /> فحص الصحة
          </button>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-lg bg-brand-500/20 border border-brand-500/40 text-brand-100 text-xs hover:bg-brand-500/30 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}{" "}
            تحديث
          </button>
        </div>
      </div>

      {/* Open incidents */}
      {data.incidents &&
        data.incidents.filter((i: any) => i.status === "open" || i.status === "acknowledged")
          .length > 0 && (
          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4 space-y-2">
            <h2 className="font-bold text-sm inline-flex items-center gap-2 text-amber-100">
              <AlertTriangle className="h-4 w-4" /> تنبيهات تحتاج انتباهك
            </h2>
            {data.incidents
              .filter((i: any) => i.status === "open" || i.status === "acknowledged")
              .slice(0, 6)
              .map((i: any) => (
                <div key={i.id} className="text-xs text-slate-200/90 flex items-center gap-2">
                  <span className="text-amber-300">•</span>{" "}
                  <span className="font-medium">{i.title}</span>{" "}
                  {i.detail && <span className="text-slate-500">— {i.detail}</span>}
                </div>
              ))}
          </section>
        )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          icon={<Wallet className="h-4 w-4 text-emerald-300" />}
          label="الرصيد"
          value={`$${s.balanceUsd.toFixed(2)}`}
          tone={s.balanceUsd <= 0 ? "warn" : undefined}
        />
        <Kpi
          icon={<MessageSquare className="h-4 w-4 text-sky-300" />}
          label="محادثات (٣٠ يوم)"
          value={monthConvs}
        />
        <Kpi
          icon={<DollarSign className="h-4 w-4 text-amber-300" />}
          label="تكلفة (٣٠ يوم)"
          value={microUsd(monthCost)}
        />
        <Kpi
          icon={<Activity className="h-4 w-4 text-rose-300" />}
          label="محادثات معلّقة"
          value={s.pendingConversations}
          tone={s.pendingConversations > 0 ? "warn" : undefined}
        />
      </div>

      {/* Top-up CTA when low */}
      {s.balanceUsd <= 0 && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.06] p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-rose-100 inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> رصيدك منتهٍ — اشحن لتستمر محادثات Meta في العمل.
          </div>
          <Link
            href="/dashboard/wallet"
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> شحن الرصيد
          </Link>
        </div>
      )}

      {/* Usage trend */}
      {trend.length > 1 && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-slate-400 mb-1 inline-flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-sky-300" /> اتجاه المحادثات اليومية (
            {trend.length} يوم)
          </div>
          <Sparkline data={trend} tone="primary" height={48} />
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Invoices */}
        <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="border-b border-white/10 p-3 font-bold text-sm inline-flex items-center gap-2">
            <FileText className="h-4 w-4 text-violet-300" /> الفواتير الشهرية
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[320px]">
              <thead className="bg-white/5 text-slate-400">
                <tr>
                  <th className="text-right p-3">الشهر</th>
                  <th className="text-right p-3">محادثات</th>
                  <th className="text-right p-3">الإجمالي</th>
                  <th className="text-right p-3">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-500 text-xs">
                      لا توجد فواتير بعد.
                    </td>
                  </tr>
                ) : (
                  data.invoices.map((inv) => (
                    <tr key={inv.id} className="border-t border-white/5">
                      <td className="p-3 tabular-nums">{inv.period}</td>
                      <td className="p-3 tabular-nums">{inv.conversations}</td>
                      <td className="p-3 tabular-nums">{inv.totalEgp} ج.م</td>
                      <td className="p-3 text-xs">{inv.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Phones */}
        <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="border-b border-white/10 p-3 font-bold text-sm inline-flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-emerald-300" /> أرقام Meta المرتبطة
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[320px]">
              <thead className="bg-white/5 text-slate-400">
                <tr>
                  <th className="text-right p-3">الرقم</th>
                  <th className="text-right p-3">الجودة</th>
                  <th className="text-right p-3">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {data.phones.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-slate-500 text-xs">
                      لا توجد أرقام مُسجّلة. استخدم «إدارة الاتصال».
                    </td>
                  </tr>
                ) : (
                  data.phones.map((p) => (
                    <tr key={p.id} className="border-t border-white/5">
                      <td className="p-3">{p.displayPhone || p.phoneNumberId}</td>
                      <td className="p-3 text-xs">{p.qualityRating || "—"}</td>
                      <td className="p-3 text-xs">{p.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Recent conversations + transactions */}
      <div className="grid gap-4 lg:grid-cols-2">
        <MiniTable
          title={`أحدث المحادثات (${s.recentConversations.length})`}
          head={["الفئة", "الدولة", "التكلفة", "الحالة"]}
          rows={s.recentConversations
            .slice(0, 10)
            .map((c) => [c.category, c.country, microUsd(c.chargedMicroUsd), c.billingStatus])}
          empty="لا توجد محادثات بعد."
        />
        <MiniTable
          title={`أحدث الحركات (${s.recentTransactions.length})`}
          head={["النوع", "ج.م", "ملاحظة", "التاريخ"]}
          rows={s.recentTransactions
            .slice(0, 10)
            .map((t) => [
              t.kind,
              t.amountEgp,
              t.note || "—",
              new Date(t.createdAt).toLocaleDateString("ar-EG"),
            ])}
          empty="لا توجد حركات بعد."
        />
      </div>
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
        className={`mt-1 text-lg font-extrabold tabular-nums ${tone === "warn" ? "text-rose-300" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
function MiniTable({
  title,
  head,
  rows,
  empty,
}: {
  title: string;
  head: string[];
  rows: any[][];
  empty: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="border-b border-white/10 p-3 text-sm font-bold text-slate-300">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[300px]">
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
                      {String(c)}
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
