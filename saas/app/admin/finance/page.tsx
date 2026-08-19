// /admin/finance — Finance Control overview: revenue (explicitly labelled),
// plan economics (real costs only), and promotion financial impact.
// All numbers come from lib/admin/finance, which aggregates existing models and
// the canonical cost aggregator. Missing cost sources render "Data unavailable".
import Link from "next/link";
import { getRevenueSummary, getPlanEconomics, getPromotionImpact } from "@/lib/admin/finance";
import { PageHeader, MetricBand, Section } from "../_ui/primitives";

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
      <PageHeader
        eyebrow="الباك أوفيس المالي"
        title="المركز المالي"
        subtitle={`إيرادات فعلية، اقتصاديات الباقات، وأثر العروض — آخر ${rev.days} يوم.`}
        actions={
          <>
            <Link href="/admin/payments" className="adm-btn">المدفوعات</Link>
            <Link href="/admin/payments/reconciliation" className="adm-btn">التسوية</Link>
          </>
        }
      />

      {/* Revenue — explicitly labelled ACTUAL / DERIVED */}
      <Section title="الإيرادات">
        <MetricBand
          items={[
            { label: "إجمالي المُحصّل (فعلي)", value: usd(rev.grossPaidUsd), sub: `${rev.paidCount} دفعة ناجحة` },
            { label: "الاستردادات (فعلي)", value: usd(rev.refundsUsd), sub: `${rev.refundCount} عملية` },
            { label: "الصافي المُحصّل (مُشتق)", value: usd(rev.netCollectedUsd), sub: "الإجمالي − الاستردادات" },
            { label: "الخصومات (فعلي)", value: usd(rev.discountsUsd), sub: "مُطبّقة مسبقاً" },
            { label: "قيد الانتظار", value: usd(rev.pendingUsd), sub: `${rev.pendingCount} معاملة` },
            { label: "فاشلة", value: String(rev.failedCount) },
          ]}
        />
      </Section>

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
