"use client";

// Sales Brain — command center UI.
//
// One read-only screen that makes KEYONE feel like a sales manager:
//   • Recommendation of the day + top AI insights (from /api/sales-brain,
//     reusing the daily-report heuristic engine — zero extra LLM tokens).
//   • Revenue Intelligence: today / 7d / AOV / conversion / repeat buyers,
//     a 7-day trend sparkline, and best-sellers.
//   • Headline signals (hot leads, awaiting reply, new customers, orders,
//     open escalations) with a deep-link to the existing detector lists at
//     /dashboard/intel (hottest leads, follow-ups, lost sales, upsell).
//
// All numbers come from /api/sales-brain in a single round-trip.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Brain,
  Flame,
  RefreshCw,
  Loader2,
  TrendingUp,
  Wallet,
  Repeat,
  Percent,
  Package,
  Lightbulb,
  Users,
  ShoppingBag,
  AlertTriangle,
  ArrowLeft,
  GraduationCap,
  Share2,
} from "lucide-react";

interface BestSeller {
  name: string;
  qty: number;
  revenue: number;
}
interface Revenue {
  revenueToday: number;
  revenue7d: number;
  aov: number;
  weeklyTrend: { day: string; total: number }[];
  conversionRatePct: number;
  repeatCustomers: number;
  customersWithOrders: number;
  bestSellers: BestSeller[];
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
interface Learning {
  windowDays: number;
  totalSent: number;
  overallReplyRate: number;
  overallConversionRate: number;
  totalRevenue: number;
  bestKind: string | null;
  worstKind: string | null;
  sampleConfidence: "low" | "medium" | "high";
  byKind: KindPerf[];
}
interface Resp {
  generatedAt: string;
  revenue: Revenue;
  insights: { id: string; text: string }[];
  recommendation: string | null;
  signals: {
    hotLeads: number;
    hotLeadsAwaiting: number;
    newCustomers: number;
    ordersCount: number;
    unresolvedEscalations: number;
  };
  learning?: Learning | null;
  memoryGraphInsights?: string[];
}

const egp = (n: number) => `${(n || 0).toLocaleString("en-US")} ج`;

const KIND_AR: Record<string, string> = {
  price_question: "سؤال عن السعر",
  pending_order: "طلب معلّق",
  hesitation_recovery: "استعادة متردد",
  product_view: "اهتمام بمنتج",
  abandoned_conversation: "محادثة متروكة",
  smart_nudge: "تذكير ذكي",
  unknown: "غير مصنّف",
};

export default function SalesBrainUi() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(refresh = false) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/sales-brain", { cache: "no-store" });
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

  const rev = data?.revenue;
  const sig = data?.signals;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-indigo-400" />
            عقل المبيعات
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            مركز القيادة — أداء اليوم، أهم الفرص، وتوصية اليوم. كل الأرقام من
            بياناتك الحالية بدون أي تكلفة إضافية.
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm inline-flex items-center gap-2 disabled:opacity-50"
          title="تحديث"
        >
          {refreshing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          تحديث
        </button>
      </div>

      {loading && (
        <div className="text-slate-400 text-sm py-12 text-center">
          <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
          جاري التحميل...
        </div>
      )}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-200 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && data && rev && sig && (
        <>
          {/* Recommendation of the day */}
          {data.recommendation && (
            <div className="bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/10 border border-indigo-400/20 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-2 text-indigo-300 text-xs font-medium mb-1.5">
                <Lightbulb className="w-4 h-4" />
                توصية اليوم
              </div>
              <div className="text-white text-lg font-semibold leading-relaxed">
                {data.recommendation}
              </div>
            </div>
          )}

          {/* Headline signals */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Stat
              icon={Flame}
              tone="text-orange-400"
              label="عملاء ساخنين"
              value={sig.hotLeads}
            />
            <Stat
              icon={AlertTriangle}
              tone="text-amber-400"
              label="بيستنوا ردك"
              value={sig.hotLeadsAwaiting}
            />
            <Stat
              icon={Users}
              tone="text-sky-400"
              label="عملاء جدد"
              value={sig.newCustomers}
            />
            <Stat
              icon={ShoppingBag}
              tone="text-emerald-400"
              label="طلبات اليوم"
              value={sig.ordersCount}
            />
            <Stat
              icon={AlertTriangle}
              tone="text-rose-400"
              label="تصعيدات مفتوحة"
              value={sig.unresolvedEscalations}
            />
          </div>

          {/* Link to detector lists (reuses /dashboard/intel) */}
          <Link
            href="/dashboard/intel"
            className="flex items-center justify-between gap-3 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl p-4 transition group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-400/20 flex items-center justify-center">
                <Flame className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <div className="font-medium text-white">
                  قوائم الفرص الجاهزة للتنفيذ
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  أهم العملاء · متابعة الفرص · استرجاع المبيعات المفقودة · بيع
                  إضافي — برسائل جاهزة للنسخ
                </div>
              </div>
            </div>
            <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-white transition shrink-0" />
          </Link>

          {/* Revenue Intelligence */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              icon={Wallet}
              tone="text-emerald-400"
              label="إيراد اليوم"
              value={egp(rev.revenueToday)}
            />
            <Stat
              icon={TrendingUp}
              tone="text-emerald-400"
              label="إيراد ٧ أيام"
              value={egp(rev.revenue7d)}
            />
            <Stat
              icon={Wallet}
              tone="text-sky-400"
              label="متوسط الطلب"
              value={egp(rev.aov)}
            />
            <Stat
              icon={Percent}
              tone="text-fuchsia-400"
              label="معدل التحويل"
              value={`${rev.conversionRatePct}%`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Weekly trend */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-white mb-3">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                اتجاه الإيراد — آخر ٧ أيام
              </div>
              <Sparkline points={rev.weeklyTrend} />
              <div className="flex items-center gap-2 mt-3 text-xs text-slate-400">
                <Repeat className="w-3.5 h-3.5 text-sky-400" />
                {rev.repeatCustomers} عميل متكرر من {rev.customersWithOrders}{" "}
                اشتروا
              </div>
            </div>

            {/* Best sellers */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-white mb-3">
                <Package className="w-4 h-4 text-amber-400" />
                الأكثر مبيعاً — آخر ٣٠ يوم
              </div>
              {rev.bestSellers.length === 0 ? (
                <div className="text-xs text-slate-500 py-6 text-center">
                  لسه مفيش مبيعات كفاية لعرض المنتجات الأعلى.
                </div>
              ) : (
                <ul className="space-y-2">
                  {rev.bestSellers.map((b, i) => (
                    <li
                      key={`${b.name}-${i}`}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-slate-500 font-mono text-xs w-4 shrink-0">
                          {i + 1}
                        </span>
                        <span className="truncate text-slate-200">
                          {b.name}
                        </span>
                      </span>
                      <span className="shrink-0 flex items-center gap-2 text-xs">
                        <span className="text-slate-400">×{b.qty}</span>
                        <span className="text-emerald-300 font-mono tabular-nums">
                          {egp(b.revenue)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* AI insights */}
          {data.insights.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-white mb-3">
                <Brain className="w-4 h-4 text-indigo-400" />
                أهم الإشارات اليوم
              </div>
              <ul className="space-y-2">
                {data.insights.map((ins) => (
                  <li
                    key={ins.id}
                    className="text-sm text-slate-200 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2"
                  >
                    {ins.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Memory-graph insight (relationships extracted from real chats) */}
          {(data.memoryGraphInsights?.length ?? 0) > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-white mb-3">
                <Share2 className="w-4 h-4 text-fuchsia-400" />
                روابط من محادثاتك
              </div>
              <ul className="space-y-2">
                {data.memoryGraphInsights!.map((t, i) => (
                  <li
                    key={i}
                    className="text-sm text-slate-200 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Self-learning panel — which follow-up types actually convert */}
          {data.learning && data.learning.totalSent > 0 && (
            <SelfLearningCard learn={data.learning} />
          )}

          <div className="text-xs text-slate-500 text-center pt-1">
            آخر تحديث{" "}
            {new Date(data.generatedAt).toLocaleTimeString("ar-EG", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SelfLearningCard({ learn }: { learn: NonNullable<Learning> }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <GraduationCap className="w-4 h-4 text-violet-300" />
        <h2 className="text-sm font-bold text-slate-200">التعلّم من النتائج</h2>
        <span className="text-[11px] text-slate-500">
          آخر {learn.windowDays} يوم · {learn.totalSent} متابعة · دقة العيّنة:{" "}
          {learn.sampleConfidence === "high"
            ? "عالية"
            : learn.sampleConfidence === "medium"
              ? "متوسطة"
              : "منخفضة"}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
          <div className="text-[10px] text-slate-500">نسبة الرد</div>
          <div className="mt-0.5 text-sm font-bold text-slate-100">
            {Math.round(learn.overallReplyRate * 100)}%
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
          <div className="text-[10px] text-slate-500">نسبة التحويل</div>
          <div className="mt-0.5 text-sm font-bold text-slate-100">
            {Math.round(learn.overallConversionRate * 100)}%
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
          <div className="text-[10px] text-slate-500">إيراد منسوب</div>
          <div className="mt-0.5 text-sm font-bold text-slate-100">
            {egp(learn.totalRevenue)}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
          <div className="text-[10px] text-slate-500">أفضل نوع متابعة</div>
          <div className="mt-0.5 text-sm font-bold text-slate-100">
            {learn.bestKind ? KIND_AR[learn.bestKind] || learn.bestKind : "—"}
          </div>
        </div>
      </div>
      {learn.byKind.filter((k) => k.sent >= 1).length > 0 && (
        <div className="space-y-1.5">
          {learn.byKind
            .filter((k) => k.sent >= 1)
            .slice(0, 6)
            .map((k) => (
              <div key={k.kind} className="flex items-center gap-3 text-[12px]">
                <span className="w-28 shrink-0 text-slate-300">
                  {KIND_AR[k.kind] || k.kind}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-400/70"
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
  );
}

function Stat({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: any;
  tone: string;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
      <Icon className={`w-5 h-5 ${tone}`} />
      <div className="text-xl font-bold text-white mt-2 tabular-nums">
        {value}
      </div>
      <div className="text-xs text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}

/** Tiny inline SVG sparkline — no chart lib, no extra deps. */
function Sparkline({ points }: { points: { day: string; total: number }[] }) {
  const W = 280;
  const H = 64;
  const max = Math.max(1, ...points.map((p) => p.total));
  const step = points.length > 1 ? W / (points.length - 1) : W;
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = H - (p.total / max) * (H - 6) - 3;
    return [x, y] as const;
  });
  const line = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,${H} ${line} ${W},${H}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-16"
    >
      <polygon points={area} fill="url(#sb-grad)" opacity="0.25" />
      <polyline
        points={line}
        fill="none"
        stroke="#34d399"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2" fill="#34d399" />
      ))}
      <defs>
        <linearGradient id="sb-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
    </svg>
  );
}
