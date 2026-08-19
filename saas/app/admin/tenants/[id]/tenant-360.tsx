"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Phone, CreditCard, Wallet as WalletIcon, ShoppingBag, Users, ShieldAlert, Clock, Activity, MessageSquare, Bot as BotIcon, CheckCircle2, XCircle,
} from "lucide-react";
import type { Tenant360 } from "./loader";
import { healthLevelMeta } from "@/lib/admin/tenant-health";

type Tab = "overview" | "subscription" | "whatsapp" | "ai" | "finance" | "commerce" | "security" | "timeline";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "نظرة عامة" },
  { key: "subscription", label: "الاشتراك" },
  { key: "whatsapp", label: "واتساب" },
  { key: "ai", label: "الذكاء الاصطناعي" },
  { key: "finance", label: "المالية" },
  { key: "commerce", label: "التجارة" },
  { key: "security", label: "الأمان" },
  { key: "timeline", label: "التسلسل الزمني" },
];

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
}

export default function Tenant360View({ data }: { data: Tenant360 }) {
  const [tab, setTab] = useState<Tab>("overview");
  const hm = healthLevelMeta(data.health.level);
  const waConnected = data.bot?.whatsappStatus === "connected";

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">{data.user.name || data.user.email}</h1>
              {data.user.suspended && <span className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-300">موقوف</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-400">
              <span>{data.user.email}</span>
              {data.user.phone && <span>{data.user.phone}</span>}
              <code className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-slate-500">{data.user.id}</code>
              <span>عضو منذ {fmtDate(data.user.createdAt)}</span>
            </div>
          </div>

          {/* Health score */}
          <div className={`shrink-0 rounded-xl border px-4 py-3 text-center ${hm.border} ${hm.bg}`}>
            <div className={`text-2xl font-bold tabular-nums ${hm.text}`}>{data.health.score}<span className="text-sm text-slate-500">/100</span></div>
            <div className={`text-[11px] font-semibold ${hm.text}`}>{hm.label}</div>
          </div>
        </div>

        {/* Quick status chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip icon={<CreditCard className="h-3.5 w-3.5" />} label="الباقة" value={data.subscription?.planName ?? "—"} />
          <Chip icon={<Activity className="h-3.5 w-3.5" />} label="الاشتراك" value={data.subscription?.status ?? "—"} tone={data.subscription?.status === "active" ? "ok" : data.subscription?.status === "expired" ? "bad" : "warn"} />
          <Chip icon={<Phone className="h-3.5 w-3.5" />} label="واتساب" value={waConnected ? "متصل" : data.bot?.whatsappStatus ?? "—"} tone={waConnected ? "ok" : "bad"} />
          <Chip icon={<ShoppingBag className="h-3.5 w-3.5" />} label="الطلبات" value={data.counts.orders.toLocaleString()} />
          <Chip icon={<Users className="h-3.5 w-3.5" />} label="العملاء" value={data.counts.customers.toLocaleString()} />
        </div>

        {/* Health reasons — explainable score */}
        {data.health.reasons.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.health.reasons.map((r, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/[0.06] px-2 py-0.5 text-[11px] text-amber-200">
                {r.label} <span className="text-amber-400/70">({r.delta})</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-white/[0.06]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-t-lg px-3 py-2 text-[13px] font-medium transition ${tab === t.key ? "border-b-2 border-brand-400 text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Panels */}
      {tab === "overview" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={<ShoppingBag className="h-4 w-4" />} label="إجمالي الطلبات" value={data.counts.orders.toLocaleString()} />
          <Stat icon={<Activity className="h-4 w-4" />} label="طلبات آخر ٧ أيام" value={data.counts.ordersLast7d.toLocaleString()} />
          <Stat icon={<Users className="h-4 w-4" />} label="العملاء" value={data.counts.customers.toLocaleString()} />
          <Stat icon={<ShieldAlert className="h-4 w-4" />} label="حوادث مفتوحة" value={data.counts.openIncidents.toLocaleString()} tone={data.counts.openIncidents > 0 ? "bad" : "ok"} />
          <Stat icon={<CreditCard className="h-4 w-4" />} label="الإيراد (مُسلّم)" value={`${data.revenueEgp.toLocaleString()} EGP`} />
          <Stat icon={<MessageSquare className="h-4 w-4" />} label="رسائل مُستخدمة" value={(data.subscription?.msgsUsed ?? 0).toLocaleString()} />
          <Stat icon={<BotIcon className="h-4 w-4" />} label="طلبات الذكاء" value={(data.subscription?.aiRequestsUsed ?? 0).toLocaleString()} />
          <Stat icon={<WalletIcon className="h-4 w-4" />} label="رصيد المحفظة" value={data.wallet ? `$${data.wallet.balanceUsd.toFixed(2)}` : "—"} />
        </div>
      )}

      {tab === "subscription" && (
        <Panel>
          {data.subscription ? (
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <Row k="الباقة" v={data.subscription.planName} />
              <Row k="الحالة" v={data.subscription.status} />
              <Row k="دورة الفوترة" v={data.subscription.billingCycle} />
              <Row k="بدأ في" v={fmtDate(data.subscription.startedAt)} />
              <Row k="ينتهي في" v={fmtDate(data.subscription.expiresAt)} />
              <Row k="انتهاء التجربة" v={fmtDate(data.subscription.trialEndsAt)} />
              <Row k="رسائل مُستخدمة" v={data.subscription.msgsUsed.toLocaleString()} />
              <Row k="طلبات ذكاء مُستخدمة" v={data.subscription.aiRequestsUsed.toLocaleString()} />
              <Row k="حملات مُستخدمة" v={data.subscription.broadcastsUsed.toLocaleString()} />
            </dl>
          ) : (
            <Empty>لا يوجد اشتراك لهذا التاجر.</Empty>
          )}
        </Panel>
      )}

      {tab === "whatsapp" && (
        <Panel>
          {data.bot ? (
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <Row k="الحالة" v={data.bot.whatsappStatus} />
              <Row k="الرقم" v={data.bot.whatsappPhone || "—"} />
              <Row k="نمط الاتصال" v={data.bot.connectionMode === "meta_cloud" ? "Meta Cloud" : "QR"} />
            </dl>
          ) : (
            <Empty>لم يُهيّأ البوت بعد.</Empty>
          )}
        </Panel>
      )}

      {tab === "ai" && (
        <Panel>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Row k="طلبات الذكاء المُستخدمة" v={(data.subscription?.aiRequestsUsed ?? 0).toLocaleString()} />
          </dl>
          <p className="mt-3 text-[11px] text-slate-500">
            تفاصيل الاستدعاءات (زمن الاستجابة، الأخطاء، التكلفة) على مستوى المنصة في{" "}
            <Link href="/admin/ai-logs" className="text-brand-300 hover:text-brand-200">سجل الذكاء</Link>.
          </p>
        </Panel>
      )}

      {tab === "finance" && (
        <div className="space-y-3">
          {data.wallet && (
            <Panel>
              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                <Row k="رصيد المحفظة" v={`$${data.wallet.balanceUsd.toFixed(2)}`} />
                <Row k="حالة المحفظة" v={data.wallet.status} />
                <Row k="إجمالي الشحن" v={`$${data.wallet.totalToppedUpUsd.toFixed(2)}`} />
                <Row k="إجمالي الإنفاق" v={`$${data.wallet.totalSpentUsd.toFixed(2)}`} />
              </dl>
            </Panel>
          )}
          <TableList
            title="أحدث المدفوعات"
            rows={data.recentPayments.map((p) => ({ id: p.id, main: `$${p.amountUsd.toFixed(2)} · ${p.methodKey}`, sub: fmtDate(p.createdAt), status: p.status }))}
            empty="لا مدفوعات."
          />
        </div>
      )}

      {tab === "commerce" && (
        <TableList
          title="أحدث الطلبات"
          rows={data.recentOrders.map((o) => ({ id: o.id, main: `${o.total.toLocaleString()} ${o.currency}`, sub: fmtDate(o.createdAt), status: o.status }))}
          empty="لا طلبات."
        />
      )}

      {tab === "security" && (
        <div className="space-y-3">
          <TableList
            title="الحوادث"
            rows={data.incidents.map((i) => ({ id: i.id, main: i.title, sub: `${i.severity} · ${fmtDate(i.createdAt)}`, status: i.status }))}
            empty="لا حوادث."
          />
          <TableList
            title="سجل التدقيق"
            rows={data.security.map((a) => ({ id: a.id, main: a.action, sub: `${a.actorEmail || "—"} · ${a.targetType || "—"}`, status: fmtDate(a.createdAt) }))}
            empty="لا أحداث تدقيق."
          />
        </div>
      )}

      {tab === "timeline" && (
        <Panel>
          <Timeline data={data} />
        </Panel>
      )}
    </div>
  );
}

// ── Small building blocks ─────────────────────────────────────────────────────
function Chip({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "ok" | "bad" | "warn" }) {
  const c = tone === "ok" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : tone === "warn" ? "text-amber-300" : "text-slate-200";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[12px]">
      <span className="text-slate-500">{icon}</span>
      <span className="text-slate-500">{label}:</span>
      <span className={`font-semibold ${c}`}>{value}</span>
    </span>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "ok" | "bad" }) {
  const c = tone === "bad" ? "text-rose-300" : tone === "ok" ? "text-emerald-300" : "text-white";
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <span className="text-slate-600">{icon}</span>
        {label}
      </div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${c}`}>{value}</div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">{children}</div>;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.04] pb-2">
      <dt className="text-[12px] text-slate-500">{k}</dt>
      <dd className="text-[13px] font-medium text-white">{v}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-6 text-center text-[12px] text-slate-600">{children}</div>;
}

function TableList({ title, rows, empty }: { title: string; rows: { id: string; main: string; sub: string; status: string }[]; empty: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      {rows.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.02]">
              <div className="min-w-0">
                <div className="truncate text-[13px] text-white">{r.main}</div>
                <div className="truncate text-[11px] text-slate-500">{r.sub}</div>
              </div>
              <span className="shrink-0 rounded-md bg-white/[0.05] px-2 py-0.5 text-[11px] text-slate-300">{r.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Unified chronological timeline built from the real recent events we loaded.
function Timeline({ data }: { data: Tenant360 }) {
  const events: { at: Date; label: string; kind: string }[] = [];
  data.recentOrders.forEach((o) => events.push({ at: new Date(o.createdAt), label: `طلب ${o.total.toLocaleString()} ${o.currency} (${o.status})`, kind: "order" }));
  data.recentPayments.forEach((p) => events.push({ at: new Date(p.createdAt), label: `دفعة $${p.amountUsd.toFixed(2)} (${p.status})`, kind: "payment" }));
  data.incidents.forEach((i) => events.push({ at: new Date(i.createdAt), label: `حادثة: ${i.title} (${i.status})`, kind: "incident" }));
  data.security.forEach((a) => events.push({ at: new Date(a.createdAt), label: `${a.action}`, kind: "audit" }));
  events.sort((a, b) => b.at.getTime() - a.at.getTime());

  if (events.length === 0) return <Empty>لا أحداث حديثة.</Empty>;

  const dot: Record<string, string> = { order: "bg-brand-400", payment: "bg-emerald-400", incident: "bg-rose-400", audit: "bg-slate-500" };
  return (
    <div className="space-y-2.5">
      {events.slice(0, 24).map((e, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[e.kind] || "bg-slate-500"}`} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-white">{e.label}</div>
            <div className="text-[11px] text-slate-500">{fmtDate(e.at)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
