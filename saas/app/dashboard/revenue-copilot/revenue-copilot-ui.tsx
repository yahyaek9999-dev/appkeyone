"use client";

// Revenue Copilot — unified opportunity worklist UI.
//
// One read-only screen that turns KEYONE's existing per-customer scores into a
// single prioritized list of revenue-driving next actions. Every row carries a
// unified Next Best Action, a confidence, and an estimated EGP value — so the
// merchant works the highest-revenue moves first instead of triaging four tabs.
//
// Also surfaces the self-learning summary: which follow-up types actually
// convert (read from data the system already records). All from
// /api/revenue-copilot in one round-trip. No auto-send — every message is a
// manual, anti-ban-safe merchant action (same philosophy as /dashboard/intel).

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  RefreshCw,
  Loader2,
  Wallet,
  Target,
  Crown,
  AlertTriangle,
  Copy,
  Check,
  Phone,
  BarChart2,
  Inbox,
} from "lucide-react";

type ValueTier = "platinum" | "gold" | "silver" | "bronze" | "lead";

interface Opportunity {
  customerId: string;
  customerName: string | null;
  customerPhone: string;
  action: string;
  title: string;
  reason: string;
  suggestedMessage: string;
  confidence: number;
  estimatedValue: number;
  priority: number;
  valueTier: ValueTier;
  leadScore: number;
  conversionScore: number;
  churnRiskScore: number;
  daysSinceLastInbound: number;
}

interface KindPerf {
  kind: string;
  sent: number;
  replied: number;
  converted: number;
  revenue: number;
  replyRate: number;
  conversionRate: number;
  learnedWeight: number;
}

interface Resp {
  generatedAt: string;
  opportunityCount: number;
  totalPipelineValue: number;
  highConfidenceValue: number;
  tierCounts: Record<ValueTier, number>;
  opportunities: Opportunity[];
  learning: {
    windowDays: number;
    totalSent: number;
    overallReplyRate: number;
    overallConversionRate: number;
    totalRevenue: number;
    bestKind: string | null;
    worstKind: string | null;
    sampleConfidence: "low" | "medium" | "high";
    byKind: KindPerf[];
  } | null;
}

const egp = (n: number) => `${(n || 0).toLocaleString("en-US")} ج`;

const TIER_META: Record<ValueTier, { label: string; cls: string }> = {
  platinum: { label: "بلاتيني", cls: "border-brand-400/40 bg-brand-400/10 text-brand-200" },
  gold: { label: "ذهبي", cls: "border-amber-400/40 bg-amber-400/10 text-amber-200" },
  silver: { label: "فضي", cls: "border-slate-300/30 bg-slate-300/10 text-slate-200" },
  bronze: { label: "برونزي", cls: "border-orange-700/40 bg-orange-700/10 text-orange-300" },
  lead: { label: "محتمل", cls: "border-white/10 bg-white/[0.03] text-slate-400" },
};

const ACTION_CLS: Record<string, string> = {
  close_now: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  answer_fast: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  escalate: "border-rose-500/40 bg-rose-500/10 text-rose-200",
  win_back: "border-gold-500/40 bg-gold-500/10 text-gold-200",
  upsell: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  build_trust: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  offer_value: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  reduce_friction: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  nudge_followup: "border-slate-400/30 bg-slate-400/10 text-slate-200",
  nurture: "border-white/10 bg-white/[0.03] text-slate-300",
};

const KIND_AR: Record<string, string> = {
  price_question: "سؤال عن السعر",
  pending_order: "طلب معلّق",
  hesitation_recovery: "استعادة متردد",
  product_view: "اهتمام بمنتج",
  abandoned_conversation: "محادثة متروكة",
  smart_nudge: "تذكير ذكي",
  unknown: "غير مصنّف",
};

export default function RevenueCopilotUi() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(refresh = false) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/revenue-copilot", { cache: "no-store" });
      if (!r.ok) throw new Error("فشل تحميل البيانات");
      setData((await r.json()) as Resp);
    } catch (e: any) {
      setError(e?.message || "خطأ غير متوقع");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const learn = data?.learning;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.05] pb-5">
        <div>
          <h1 className="page-title">فرص الإيرادات</h1>
          <p className="page-desc mt-1">أعلى الفرص قيمةً — لكل عميل الخطوة التالية والقيمة المتوقعة.</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          تحديث
        </button>
      </div>

      {loading && (
        <div className="text-slate-400 text-sm py-12 text-center">
          <Loader2 className="w-5 h-5 animate-spin inline-block ml-2" />
          جاري التحميل...
        </div>
      )}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-200 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Headline KPIs — metric band */}
          <div className="grid grid-cols-2 divide-x divide-x-reverse divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02] sm:grid-cols-4">
            {[
              { label: "فرص نشطة", value: `${data.opportunityCount}`, cls: "text-brand-300" },
              { label: "القيمة المتوقعة", value: egp(data.totalPipelineValue), cls: "text-emerald-300" },
              { label: "الفرص المرتفعة", value: egp(data.highConfidenceValue), cls: "text-sky-300" },
              { label: "عملاء ذهبي+", value: `${(data.tierCounts.platinum || 0) + (data.tierCounts.gold || 0)}`, cls: "text-amber-300" },
            ].map((m) => (
              <div key={m.label} className="px-4 py-3">
                <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">{m.label}</div>
                <div className={`mt-1.5 text-[22px] font-bold tabular-nums ${m.cls}`}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Follow-up performance summary */}
          {learn && learn.totalSent > 0 && (
            <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]">
              <div className="flex items-center gap-2 border-b border-white/[0.05] px-4 py-3">
                <BarChart2 className="w-4 h-4 text-slate-400" />
                <h2 className="text-[13px] font-semibold text-white">نتائج المتابعات</h2>
                <span className="text-[11px] text-slate-500">
                  آخر {learn.windowDays} يوم · {learn.totalSent} رسالة
                </span>
              </div>
              <div className="grid grid-cols-2 divide-x divide-x-reverse divide-white/[0.05] sm:grid-cols-4">
                {[
                  { label: "معدل الرد", value: `${Math.round(learn.overallReplyRate * 100)}%` },
                  { label: "معدل التحويل", value: `${Math.round(learn.overallConversionRate * 100)}%` },
                  { label: "إيراد من متابعات", value: egp(learn.totalRevenue) },
                  { label: "أنجح نوع", value: learn.bestKind ? KIND_AR[learn.bestKind] || learn.bestKind : "—" },
                ].map((m) => (
                  <div key={m.label} className="px-4 py-3">
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">{m.label}</div>
                    <div className="mt-1 text-[15px] font-bold text-white">{m.value}</div>
                  </div>
                ))}
              </div>
              {learn.byKind.filter((k) => k.sent >= 1).length > 0 && (
                <div className="space-y-1.5 border-t border-white/[0.05] px-4 py-3">
                  {learn.byKind
                    .filter((k) => k.sent >= 1)
                    .slice(0, 6)
                    .map((k) => (
                      <div key={k.kind} className="flex items-center gap-3 text-[12px]">
                        <span className="w-28 shrink-0 text-slate-300">{KIND_AR[k.kind] || k.kind}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand-400/70"
                            style={{ width: `${Math.round(k.conversionRate * 100)}%` }}
                          />
                        </div>
                        <span className="w-32 shrink-0 text-left text-slate-400">
                          تحويل {Math.round(k.conversionRate * 100)}% · {k.sent} إرسال
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Opportunity worklist */}
          {data.opportunities.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-10 text-center text-slate-400">
              <Inbox className="w-8 h-8 mx-auto mb-2 opacity-50" />
              لا توجد فرص نشطة الآن. لما يبدأ عملاؤك يتفاعلوا، هتظهر هنا أهم الخطوات
              مرتّبة بالقيمة.
            </div>
          ) : (
            <div className="space-y-3">
              {data.opportunities.map((o) => (
                <OpportunityRow key={o.customerId} o={o} />
              ))}
            </div>
          )}

          <p className="text-[11px] text-slate-600 text-center pt-2">
            كل الرسائل مقترحات تُرسل يدوياً بنفسك — لا إرسال تلقائي. آخر تحديث:{" "}
            {new Date(data.generatedAt).toLocaleString("ar-EG")}
          </p>
        </>
      )}
    </div>
  );
}

function OpportunityRow({ o }: { o: Opportunity }) {
  const [copied, setCopied] = useState(false);
  const tier = TIER_META[o.valueTier] || TIER_META.lead;
  const actionCls = ACTION_CLS[o.action] || ACTION_CLS.nurture;

  async function copyMsg() {
    if (!o.suggestedMessage) return;
    try {
      await navigator.clipboard.writeText(o.suggestedMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015] transition hover:border-white/[0.12]">
      {/* Row summary */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/dashboard/customers/${o.customerId}`}
              className="text-[13px] font-semibold text-white hover:text-brand-300 transition-colors"
            >
              {o.customerName || o.customerPhone}
            </Link>
            <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${tier.cls}`}>
              <Crown className="w-2.5 h-2.5" /> {tier.label}
            </span>
            {o.churnRiskScore >= 55 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
                <AlertTriangle className="w-2.5 h-2.5" /> خطر فقدان
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${actionCls}`}>
              {o.title}
            </span>
            <span className="text-[12px] text-slate-400">{o.reason}</span>
          </div>
        </div>
        <div className="shrink-0 text-left">
          <div className="text-[15px] font-bold tabular-nums text-emerald-300">{egp(o.estimatedValue)}</div>
          <div className="text-[10px] text-slate-600">
            {o.confidence >= 75 ? "احتمالية عالية" : o.confidence >= 50 ? "متوسطة" : "منخفضة"}
          </div>
        </div>
      </div>

      {/* Suggested message + actions */}
      {o.suggestedMessage && (
        <div className="border-t border-white/[0.04] px-4 pb-3 pt-2.5">
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-[13px] leading-relaxed text-slate-200 mb-2.5">
            {o.suggestedMessage}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyMsg}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-slate-400 transition hover:text-white hover:bg-white/[0.06]"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "تم النسخ" : "نسخ الرسالة"}
            </button>
            <Link
              href={`/dashboard/inbox?c=${o.customerId}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-slate-400 transition hover:text-white hover:bg-white/[0.06]"
            >
              <Phone className="w-3.5 h-3.5" /> فتح المحادثة
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

