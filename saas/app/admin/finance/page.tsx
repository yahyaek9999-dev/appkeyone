// /admin/finance — Finance Control overview: revenue (explicitly labelled),
// plan economics (real costs only), and promotion financial impact.
// All numbers come from lib/admin/finance, which aggregates existing models and
// the canonical cost aggregator. Missing cost sources render "Data unavailable".
import Link from "next/link";
import { getRevenueSummary, getPlanEconomics, getPromotionImpact } from "@/lib/admin/finance";
import { TrendingUp, RotateCcw, Tag, AlertCircle, Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function AdminFinancePage() {
  const [rev, econ, promos] = await Promise.all([
    getRevenueSummary(30),
    getPlanEconomics(30),
    getPromotionImpact(),
  ]);

  const activePromos = promos.filter((p) => p.status === "active");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] pb-5">
        <div>
          <h1 className="page-title mb-1">المركز المالي</h1>
          <p className="page-desc">إيرادات فعلية، اقتصاديات الباقات، وأثر العروض — آخر {rev.days} يوم.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/payments" className="btn-ghost text-sm">المدفوعات</Link>
          <Link href="/admin/payments/reconciliation" className="btn-ghost text-sm">التسوية</Link>
        </div>
      </div>

      {/* Revenue — every tile explicitly labelled ACTUAL / DERIVED */}
      <section>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">الإيرادات</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tile icon={<TrendingUp className="h-5 w-5 text-emerald-300" />} label="إجمالي المُحصّل (فعلي)" value={usd(rev.grossPaidUsd)} sub={`${rev.paidCount} دفعة ناجحة`} />
          <Tile icon={<RotateCcw className="h-5 w-5 text-sky-300" />} label="الاستردادات (فعلي)" value={usd(rev.refundsUsd)} sub={`${rev.refundCount} عملية`} />
          <Tile icon={<TrendingUp className="h-5 w-5 text-brand-300" />} label="الصافي المُحصّل (مُشتق)" value={usd(rev.netCollectedUsd)} sub="الإجمالي − الاستردادات" tone="ok" />
          <Tile icon={<Tag className="h-5 w-5 text-amber-300" />} label="قيمة الخصومات (فعلي)" value={usd(rev.discountsUsd)} sub="لا تُخصم من الصافي — مُطبّقة مسبقاً" />
          <Tile icon={<Wallet className="h-5 w-5 text-amber-300" />} label="قيد الانتظار (فعلي)" value={usd(rev.pendingUsd)} sub={`${rev.pendingCount} معاملة`} />
          <Tile icon={<AlertCircle className="h-5 w-5 text-rose-300" />} label="عمليات فاشلة (فعلي)" value={String(rev.failedCount)} tone={rev.failedCount > 0 ? "warn" : undefined} />
        </div>
      </section>

      {/* Plan economics */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">اقتصاديات الباقات</h2>
          {!econ.aiPricesConfigured && (
            <span className="rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-2 py-0.5 text-[10px] text-amber-300">
              أسعار الذكاء غير مُهيّأة — التكلفة تقديرية بالأسعار الافتراضية
            </span>
          )}
        </div>
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-slate-400">
                <tr>
                  <th className="p-3 text-right">الباقة</th>
                  <th className="p-3 text-right">مشتركون</th>
                  <th className="p-3 text-right">MRR (فعلي)</th>
                  <th className="p-3 text-right">مُحصّل (فعلي)</th>
                  <th className="p-3 text-right">خصومات (فعلي)</th>
                  <th className="p-3 text-right">تكلفة رسائل (فعلي)</th>
                  <th className="p-3 text-right">تكلفة ذكاء (تقديري)</th>
                  <th className="p-3 text-right">رسوم البوابات</th>
                  <th className="p-3 text-right">هامش جزئي</th>
                </tr>
              </thead>
              <tbody>
                {econ.rows.length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-slate-500">لا باقات نشطة.</td></tr>
                )}
                {econ.rows.map((r) => (
                  <tr key={r.slug} className="border-t border-white/5">
                    <td className="p-3">
                      <div className="font-semibold text-white">{r.name}</div>
                      <div className="font-mono text-[10px] text-slate-600" dir="ltr">{r.slug}</div>
                    </td>
                    <td className="p-3 tabular-nums text-slate-300">{r.activeSubs}</td>
                    <td className="p-3 tabular-nums font-semibold text-white">{usd(r.mrrUsd)}</td>
                    <td className="p-3 tabular-nums text-emerald-300">{usd(r.collectedUsd)}</td>
                    <td className="p-3 tabular-nums text-amber-300">{usd(r.discountUsd)}</td>
                    <td className="p-3 tabular-nums text-slate-300">{usd(r.messagingCostUsd)}</td>
                    <td className="p-3 tabular-nums text-slate-400">{usd(r.aiCostUsd)}</td>
                    <td className="p-3 text-[11px] text-slate-600">غير متوفرة</td>
                    <td className="p-3">
                      <span className={`tabular-nums font-semibold ${r.partialMarginUsd >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {usd(r.partialMarginUsd)}
                      </span>
                      {r.partialMarginPct != null && <span className="ms-1 text-[11px] text-slate-500">({r.partialMarginPct}%)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{econ.note}</p>
      </section>

      {/* Promotion impact */}
      <section>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          أثر العروض ({activePromos.length} نشط من {promos.length})
        </h2>
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-slate-400">
                <tr>
                  <th className="p-3 text-right">العرض</th>
                  <th className="p-3 text-right">النوع</th>
                  <th className="p-3 text-right">الحالة</th>
                  <th className="p-3 text-right">الاستخدامات</th>
                  <th className="p-3 text-right">العملاء</th>
                  <th className="p-3 text-right">قيمة الخصم</th>
                  <th className="p-3 text-right">ينتهي</th>
                </tr>
              </thead>
              <tbody>
                {promos.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-500">لا عروض.</td></tr>
                )}
                {promos.map((p) => (
                  <tr key={p.id} className="border-t border-white/5">
                    <td className="p-3">
                      <div className="font-semibold text-white">{p.name}</div>
                      {p.code && <code className="text-[10px] text-slate-500" dir="ltr">{p.code}</code>}
                    </td>
                    <td className="p-3 text-[12px] text-slate-400" dir="ltr">{p.type}</td>
                    <td className="p-3">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] ${p.status === "active" ? "bg-emerald-500/10 text-emerald-300" : "bg-white/[0.05] text-slate-400"}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="p-3 tabular-nums text-slate-300">
                      {p.redemptions}{p.usageLimit != null && <span className="text-slate-600"> / {p.usageLimit}</span>}
                    </td>
                    <td className="p-3 tabular-nums text-slate-300">{p.customers}</td>
                    <td className="p-3 tabular-nums font-semibold text-amber-300">{usd(p.discountUsd)}</td>
                    <td className="p-3 text-[12px] text-slate-500">
                      {p.endsAt ? new Date(p.endsAt).toLocaleDateString("ar-EG") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function Tile({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: "ok" | "warn" }) {
  const border = tone === "warn" ? "border-rose-500/25" : tone === "ok" ? "border-emerald-500/20" : "border-white/[0.06]";
  return (
    <div className={`rounded-xl border ${border} bg-white/[0.02] p-4`}>
      <div className="mb-2 flex items-center gap-2 text-sm text-slate-400">{icon}<span>{label}</span></div>
      <div className="text-2xl font-extrabold tabular-nums text-white">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}
