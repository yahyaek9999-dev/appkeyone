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
  Sparkles,
  RefreshCw,
  Loader2,
  Wallet,
  Target,
  Crown,
  AlertTriangle,
  TrendingUp,
  Copy,
  Check,
  Phone,
  GraduationCap,
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
  platinum: { label: "بلاتيني", cls: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" },
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-brand-400" />
            مساعد الإيرادات
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            قائمة واحدة مرتّبة بأعلى الفرص قيمةً — لكل عميل الخطوة التالية الأفضل،
            نسبة الثقة، والقيمة المتوقعة. كله مبني على بياناتك الحالية بدون أي
            تكلفة إضافية.
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm inline-flex items-center gap-2 disabled:opacity-50"
          title="تحديث"
        >
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
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
          {/* Headline KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={<Target className="w-4 h-4" />} label="فرص نشطة" value={`${data.opportunityCount}`} tone="brand" />
            <Kpi icon={<Wallet className="w-4 h-4" />} label="قيمة الفرص المتوقعة" value={egp(data.totalPipelineValue)} tone="emerald" />
            <Kpi icon={<TrendingUp className="w-4 h-4" />} label="قيمة عالية الثقة" value={egp(data.highConfidenceValue)} tone="sky" />
            <Kpi
              icon={<Crown className="w-4 h-4" />}
              label="عملاء ذهبي+"
              value={`${(data.tierCounts.platinum || 0) + (data.tierCounts.gold || 0)}`}
              tone="amber"
            />
          </div>

          {/* Self-learning summary */}
          {learn && learn.totalSent > 0 && (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-center gap-2 mb-3">
                <GraduationCap className="w-4 h-4 text-gold-300" />
                <h2 className="text-sm font-bold text-slate-200">التعلّم من النتائج</h2>
                <span className="text-[11px] text-slate-500">
                  آخر {learn.windowDays} يوم · {learn.totalSent} متابعة · دقة العيّنة:{" "}
                  {learn.sampleConfidence === "high" ? "عالية" : learn.sampleConfidence === "medium" ? "متوسطة" : "منخفضة"}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <MiniKpi label="نسبة الرد" value={`${Math.round(learn.overallReplyRate * 100)}%`} />
                <MiniKpi label="نسبة التحويل" value={`${Math.round(learn.overallConversionRate * 100)}%`} />
                <MiniKpi label="إيراد منسوب" value={egp(learn.totalRevenue)} />
                <MiniKpi label="أفضل نوع متابعة" value={learn.bestKind ? KIND_AR[learn.bestKind] || learn.bestKind : "—"} />
              </div>
              {learn.byKind.filter((k) => k.sent >= 1).length > 0 && (
                <div className="space-y-1.5">
                  {learn.byKind
                    .filter((k) => k.sent >= 1)
                    .slice(0, 6)
                    .map((k) => (
                      <div key={k.kind} className="flex items-center gap-3 text-[12px]">
                        <span className="w-28 shrink-0 text-slate-300">{KIND_AR[k.kind] || k.kind}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gold-400/70"
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
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 hover:border-white/[0.12] transition">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white truncate">{o.customerName || o.customerPhone}</span>
            <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${tier.cls}`}>
              <Crown className="w-2.5 h-2.5" /> {tier.label}
            </span>
            {o.churnRiskScore >= 55 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
                <AlertTriangle className="w-2.5 h-2.5" /> خطر فقدان
              </span>
            )}
          </div>
          <div className={`mt-1.5 inline-flex items-center rounded-lg border px-2 py-0.5 text-[12px] font-bold ${actionCls}`}>
            {o.title}
          </div>
          <p className="mt-1.5 text-[13px] text-slate-300 leading-relaxed">{o.reason}</p>
        </div>
        <div className="shrink-0 text-left">
          <div className="text-emerald-300 font-bold text-sm">{egp(o.estimatedValue)}</div>
          <div className="text-[11px] text-slate-500">ثقة {o.confidence}%</div>
        </div>
      </div>

      {o.suggestedMessage && (
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="text-[13px] leading-relaxed text-slate-200">{o.suggestedMessage}</div>
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <button
          onClick={copyMsg}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[12px] font-semibold text-slate-200 transition hover:bg-white/[0.08]"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "تم النسخ" : "نسخ الرسالة"}
        </button>
        <Link
          href={`/dashboard/inbox?c=${o.customerId}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[12px] font-semibold text-slate-200 transition hover:bg-white/[0.08]"
        >
          <Phone className="w-3.5 h-3.5" /> فتح المحادثة
        </Link>
      </div>
    </div>
  );
}

const KPI_TONE: Record<string, string> = {
  brand: "text-brand-300",
  emerald: "text-emerald-300",
  sky: "text-sky-300",
  amber: "text-amber-300",
};

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${KPI_TONE[tone] || "text-slate-300"}`}>
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-lg font-black text-white">{value}</div>
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-bold text-slate-100">{value}</div>
    </div>
  );
}
