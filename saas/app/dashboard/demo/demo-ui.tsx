"use client";

// Demo / "Try it now" mode — read-only synthetic data experience.
//
// Shows a realistic Inbox + Customer 360 (NBA card) + Revenue Copilot preview
// populated with synthetic customers so a new merchant can feel the value
// BEFORE connecting WhatsApp. Never sends anything, never writes to real tables.
// Clearly badged "تجريبي". One CTA to exit into real setup.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MessageSquare, Users, TrendingUp, Wallet,
  Crown, AlertTriangle, Copy, Check, ArrowLeft, Phone, Loader2,
  FlaskConical, X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

type Customer = {
  id: string; name: string; phone: string; leadScore: number;
  lastIntent: string; lastSentiment: string; botPaused: boolean;
  lastMessage: string; lastRole: string; lastAt: string; msgCount: number;
};
type Message = { id: string; role: string; content: string; createdAt: string };
type NbaData = { action: string; title: string; reason: string; confidence: number; suggestedMessage: string; valueTier: string; churnRisk: number };

type DemoData = {
  customers: Customer[];
  orders: { id: string; customerName: string; total: number; status: string; items: string; createdAt: string }[];
  nba: Record<string, NbaData>;
  stats: { totalCustomers: number; totalMessages: number; hotLeads: number; totalRevenue: number; pipelineValue: number };
};

const ORDER_STATUS_AR: Record<string, string> = {
  pending: "بانتظار التأكيد", confirmed: "مؤكّد", delivering: "جاري التوصيل",
  delivered: "تم التوصيل", canceled: "ملغي",
};
const TIER_CLS: Record<string, string> = {
  platinum: "border-brand-400/40 bg-brand-400/10 text-brand-200",
  gold: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  silver: "border-slate-300/30 bg-slate-300/10 text-slate-200",
  bronze: "border-orange-700/40 bg-orange-700/10 text-orange-300",
  lead: "border-white/10 bg-white/[0.03] text-slate-400",
};
const TIER_AR: Record<string, string> = { platinum: "بلاتيني", gold: "ذهبي", silver: "فضي", bronze: "برونزي", lead: "محتمل" };

export default function DemoUi() {
  const [data, setData] = useState<DemoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [conv, setConv] = useState<{ customer: Customer; messages: Message[] } | null>(null);
  const [loadingConv, setLoadingConv] = useState(false);
  const [tab, setTab] = useState<"inbox" | "copilot" | "orders">("inbox");
  const [copied, setCopied] = useState<string | null>(null);
  const [banner, setBanner] = useState(true);

  useEffect(() => {
    fetch("/api/demo/data", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { setData(j); if (j.customers?.[0]) setActiveId(j.customers[0].id); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activeId) return;
    setLoadingConv(true);
    fetch(`/api/demo/data?type=conversation&customerId=${activeId}`)
      .then((r) => r.json())
      .then(setConv)
      .finally(() => setLoadingConv(false));
  }, [activeId]);

  async function copy(text: string, id: string) {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1800); } catch {}
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!data) return <div className="text-rose-300 p-8">تعذر تحميل البيانات التجريبية.</div>;

  const activeCustomer = data.customers.find((c) => c.id === activeId);
  const activeNba = activeId ? data.nba[activeId] : null;

  return (
    <div className="space-y-4">
      {/* Demo banner */}
      {banner && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 pr-4">
          <FlaskConical className="h-5 w-5 shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1">
            <span className="text-sm font-semibold text-amber-200">وضع تجريبي — بيانات نموذجية</span>
            <span className="mr-2 text-xs text-amber-300/70">لا يُرسل أي شيء ولا يُعدّل بياناتك الحقيقية.</span>
          </div>
          <Link href="/dashboard/whatsapp" className="btn-primary shrink-0 text-xs">
            ابدأ الإعداد الحقيقي
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
          <button onClick={() => setBanner(false)} className="shrink-0 text-amber-400/60 hover:text-amber-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.05] pb-5">
        <div>
          <h1 className="page-title">جرّب KEYONE</h1>
          <p className="page-desc mt-1">استعرض الواجهة الكاملة مع عملاء نموذجيين قبل ربط واتساب.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
          <FlaskConical className="h-3 w-3" /> تجريبي
        </span>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile icon={<Users className="h-4 w-4" />} label="عملاء" value={String(data.stats.totalCustomers)} tone="blue" />
        <KpiTile icon={<MessageSquare className="h-4 w-4" />} label="رسائل" value={String(data.stats.totalMessages)} tone="brand" />
        <KpiTile icon={<TrendingUp className="h-4 w-4" />} label="عملاء ساخنون" value={String(data.stats.hotLeads)} tone="orange" />
        <KpiTile icon={<Wallet className="h-4 w-4" />} label="قيمة الفرص" value={`${data.stats.pipelineValue.toLocaleString()} ج`} tone="emerald" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/[0.06] pb-0">
        {(["inbox", "copilot", "orders"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold transition border-b-2 -mb-px ${
              tab === t ? "border-brand-500 text-brand-300" : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            {t === "inbox" ? "الواردات" : t === "copilot" ? "مساعد الإيرادات" : "الطلبات"}
          </button>
        ))}
      </div>

      {/* Inbox tab */}
      {tab === "inbox" && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Customer list */}
          <div className="lg:col-span-1 space-y-1">
            {data.customers.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`w-full flex items-start gap-3 rounded-2xl border p-3 text-right transition hover:border-brand-500/25 hover:bg-brand-500/8 ${
                  activeId === c.id ? "border-brand-500/35 bg-brand-500/10" : "border-transparent"
                }`}
              >
                <Avatar name={c.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-sm font-medium truncate">{c.name}</span>
                    <span className="text-[10px] text-slate-500 shrink-0">{timeShort(c.lastAt)}</span>
                  </div>
                  <div className="text-xs text-slate-400 truncate mt-0.5">
                    {c.lastRole === "assistant" ? "🤖 " : ""}{c.lastMessage}
                  </div>
                  {c.leadScore > 0 && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full ${c.leadScore >= 70 ? "bg-orange-400" : c.leadScore >= 40 ? "bg-amber-400" : "bg-slate-500"}`}
                          style={{ width: `${c.leadScore}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500">{c.leadScore}</span>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Conversation + NBA */}
          <div className="lg:col-span-2 space-y-3">
            {/* NBA card */}
            {activeNba && (
              <div className="rounded-2xl border border-brand-500/30 bg-gradient-to-b from-brand-500/[0.08] to-transparent p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-300 flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" /> الإجراء المقترح
                  </span>
                  <span className="text-[11px] font-bold text-brand-200">{activeNba.confidence >= 75 ? "احتمالية عالية" : activeNba.confidence >= 50 ? "احتمالية متوسطة" : "احتمالية منخفضة"}</span>
                </div>
                <div className="text-sm font-bold text-white mb-1">{activeNba.title}</div>
                <p className="text-xs text-slate-300 mb-3">{activeNba.reason}</p>
                {activeNba.suggestedMessage && (
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 mb-2">
                    <div className="text-sm text-slate-200">{activeNba.suggestedMessage}</div>
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => copy(activeNba.suggestedMessage, activeNba.action)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/[0.08]"
                  >
                    {copied === activeNba.action ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied === activeNba.action ? "تم النسخ" : "نسخ الرسالة"}
                  </button>
                  <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold ${TIER_CLS[activeNba.valueTier] || TIER_CLS.lead}`}>
                    <Crown className="h-3 w-3" /> {TIER_AR[activeNba.valueTier] || activeNba.valueTier}
                  </span>
                  {activeNba.churnRisk >= 55 && (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-300">
                      <AlertTriangle className="h-3 w-3" /> خطر فقدان
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="card p-3 space-y-2 max-h-80 overflow-y-auto">
              {loadingConv ? (
                <div className="flex items-center justify-center py-6 text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : conv?.messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[80%] rounded-2xl border px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "border-white/10 bg-white/[0.055] text-slate-100"
                      : "border-brand-500/35 bg-brand-500/15 text-slate-100"
                  }`}>
                    <div className="text-[10px] opacity-60 mb-0.5">{m.role === "user" ? "العميل" : "🤖 البوت"}</div>
                    {m.content}
                  </div>
                </div>
              ))}
            </div>

            {/* Demo: input blocked */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center text-xs text-slate-500">
              <FlaskConical className="h-4 w-4 inline-block ml-1.5 text-amber-400" />
              وضع تجريبي — لإرسال رسائل حقيقية{" "}
              <Link href="/dashboard/whatsapp" className="text-brand-400 hover:underline">اربط واتساب</Link>
            </div>
          </div>
        </div>
      )}

      {/* Revenue Copilot tab */}
      {tab === "copilot" && (
        <div className="space-y-3">
          {data.customers.map((c) => {
            const nba = data.nba[c.id];
            if (!nba) return null;
            return (
              <div key={c.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 hover:border-white/[0.12] transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-3">
                    <Avatar name={c.name} size="md" />
                    <div>
                      <div className="font-semibold text-white text-sm">{c.name}</div>
                      <div className={`mt-1 inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-bold ${TIER_CLS[nba.valueTier] || TIER_CLS.lead}`}>
                        {nba.title}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-emerald-300 font-bold text-sm">{c.leadScore * 50} ج</div>
                    <div className="text-[11px] text-slate-500">{nba.confidence >= 75 ? "احتمالية عالية" : nba.confidence >= 50 ? "احتمالية متوسطة" : "احتمالية منخفضة"}</div>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-400">{nba.reason}</p>
                {nba.suggestedMessage && (
                  <div className="mt-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-xs text-slate-200">
                    {nba.suggestedMessage}
                  </div>
                )}
                <button
                  onClick={() => copy(nba.suggestedMessage, c.id)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-slate-200 transition hover:bg-white/[0.08]"
                >
                  {copied === c.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copied === c.id ? "تم النسخ" : "نسخ الرسالة"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Orders tab */}
      {tab === "orders" && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">العميل</th>
                <th className="table-header">المنتجات</th>
                <th className="table-header">الإجمالي</th>
                <th className="table-header">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o.id}>
                  <td className="table-cell font-medium">{o.customerName}</td>
                  <td className="table-cell text-slate-400 text-xs">{o.items}</td>
                  <td className="table-cell font-semibold text-emerald-300">{o.total.toLocaleString()} ج</td>
                  <td className="table-cell">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px]">
                      {ORDER_STATUS_AR[o.status] || o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Exit CTA */}
      <div className="flex items-center justify-center pt-2">
        <Link
          href="/dashboard/whatsapp"
          className="btn-primary gap-2 px-6 py-3"
        >
          <Phone className="h-4 w-4" />
          اربط واتساب وابدأ مع بياناتك الحقيقية
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function KpiTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  const cls: Record<string, string> = {
    blue: "from-blue-500/20 to-blue-600/5 text-blue-400 border-blue-500/15",
    brand: "from-brand-500/20 to-emerald-500/5 text-brand-400 border-brand-500/15",
    orange: "from-orange-500/20 to-amber-500/5 text-orange-400 border-orange-500/15",
    emerald: "from-emerald-500/20 to-green-500/5 text-emerald-400 border-emerald-500/15",
  };
  return (
    <div className="kpi-card">
      <div className={`kpi-icon border bg-gradient-to-br ${cls[tone] || cls.brand}`}>{icon}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

function timeShort(s: string) {
  if (!s) return "";
  const diffMin = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
  if (diffMin < 1) return "الآن";
  if (diffMin < 60) return `${diffMin}د`;
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)}س`;
  return `${Math.floor(diffMin / (60 * 24))}ي`;
}
