// Admin per-merchant cost & performance observability (Agent 4 / Task 1).
// Read-only server component. Admin-gated by app/admin/layout.tsx. No client JS.
//
// Surfaces, per merchant, over a trailing 7d or 30d window:
//   - estimated LLM cost (USD) + token spend (in/out)
//   - LLM call volume, failure rate, average latency
//   - WhatsApp send success rate + message volume (outbound/inbound)
//
// The point is operator confidence: a regression that spikes a merchant's cost
// or drops their send-success rate is visible here. Data is attributed from
// existing tables (ProviderUsage, WaMessage) — no schema change, no mutations.

import { getTenantCosts } from "@/lib/observability/tenant-costs";
import { flush } from "@/lib/metrics";
import Link from "next/link";
import { Activity, AlertCircle, Coins, Gauge, Send, Users } from "lucide-react";

export const dynamic = "force-dynamic";

function fmt(n: number): string {
  return (n || 0).toLocaleString("en-US");
}

function usd(n: number): string {
  return `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function AdminTenantCostsPage(props: {
  searchParams: Promise<{ days?: string }>;
}) {
  // Flush in-memory metric buffers so very-recent LLM activity is included.
  await flush().catch(() => {});

  const searchParams = await props.searchParams;
  const days = searchParams?.days === "7" ? 7 : 30;
  const data = await getTenantCosts({ days });
  const t = data.totals;

  const sendRate =
    t.sendSuccessRatePct === null ? "—" : `${t.sendSuccessRatePct}%`;

  return (
    <div>
      <h1 className="text-3xl font-extrabold mb-2">التكلفة والأداء لكل تاجر</h1>
      <p className="text-slate-400 mb-4">
        رصد تشغيلي لكل تاجر — استهلاك الذكاء الاصطناعي، زمن الاستجابة، ونسبة نجاح
        الإرسال. للقراءة فقط، يُحسب من السجلات الفعلية.
      </p>

      {/* Window toggle */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-sm text-slate-500">النافذة الزمنية:</span>
        <Link
          href="/admin/tenant-costs?days=7"
          className={
            "px-3 py-1 rounded-lg text-sm border " +
            (days === 7
              ? "bg-brand-500/20 border-brand-400/40 text-white"
              : "border-white/10 text-slate-400 hover:text-white")
          }
        >
          آخر 7 أيام
        </Link>
        <Link
          href="/admin/tenant-costs?days=30"
          className={
            "px-3 py-1 rounded-lg text-sm border " +
            (days === 30
              ? "bg-brand-500/20 border-brand-400/40 text-white"
              : "border-white/10 text-slate-400 hover:text-white")
          }
        >
          آخر 30 يوم
        </Link>
        <span className="text-xs text-slate-600 mr-auto">
          منذ {data.sinceDay} (UTC)
        </span>
      </div>

      {/* Platform tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <Tile icon={<Users className="w-5 h-5" />} label="تجار نشطون" value={fmt(t.merchants)} />
        <Tile icon={<Coins className="w-5 h-5 text-amber-300" />} label="تكلفة تقديرية" value={usd(t.estUsd)} />
        <Tile icon={<Activity className="w-5 h-5 text-brand-300" />} label="استدعاءات LLM" value={fmt(t.llmCalls)} />
        <Tile icon={<AlertCircle className={"w-5 h-5 " + (t.llmFailures > 0 ? "text-rose-300" : "text-slate-400")} />} label="استدعاءات فاشلة" value={fmt(t.llmFailures)} tone={t.llmFailures > 0 ? "warn" : "ok"} />
        <Tile icon={<Gauge className="w-5 h-5 text-emerald-300" />} label="متوسط زمن LLM" value={`${fmt(t.avgLatencyMs)} ms`} />
        <Tile icon={<Send className="w-5 h-5 text-sky-300" />} label="نجاح الإرسال" value={sendRate} />
      </div>

      {/* Pricing note — be explicit that USD is an estimate */}
      <div className="text-xs text-slate-500 mb-4">
        💡 التكلفة بالدولار <b>تقديرية</b> بناءً على أسعار قائمة عامة لكل 1000
        توكن
        {data.pricesConfigured
          ? " (مضبوطة عبر KEYONE_PROVIDER_PRICES_JSON)"
          : " (الافتراضي — يمكن ضبطها عبر KEYONE_PROVIDER_PRICES_JSON)"}
        . مزوّد keyone (البنية الذاتية) لا يُحتسب لكل توكن. زمن LLM هو
        <b> المتوسط</b> (السجل المجمّع لا يحتفظ بعيّنات لكل نداء لحساب p95).
      </div>

      {/* Per-merchant table */}
      <div className="card p-5">
        <h2 className="font-bold text-lg mb-4">حسب التاجر — مرتّب بالأعلى تكلفة</h2>
        {data.rows.length === 0 ? (
          <div className="text-slate-500 text-sm py-8 text-center">
            لا يوجد نشاط مسجّل في هذه النافذة الزمنية بعد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/5">
                  <th className="text-right p-2">التاجر</th>
                  <th className="text-right p-2">تكلفة تقديرية</th>
                  <th className="text-right p-2">Tokens (in / out)</th>
                  <th className="text-right p-2">استدعاءات</th>
                  <th className="text-right p-2">فشل LLM</th>
                  <th className="text-right p-2">متوسط الزمن</th>
                  <th className="text-right p-2">إرسال واتساب</th>
                  <th className="text-right p-2">نجاح الإرسال</th>
                  <th className="text-right p-2">رسائل (صادر / وارد)</th>
                  <th className="text-right p-2">المزوّدون</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.userId} className="border-t border-white/5">
                    <td className="p-2">
                      <div className="font-semibold truncate max-w-[180px]">{r.name || "—"}</div>
                      <div className="text-[10px] text-slate-500 font-mono truncate max-w-[180px]">{r.email}</div>
                    </td>
                    <td className="p-2 font-semibold">{usd(r.estUsd)}</td>
                    <td className="p-2 font-mono text-xs">{fmt(r.inputTokens)} / {fmt(r.outputTokens)}</td>
                    <td className="p-2">{fmt(r.llmCalls)}</td>
                    <td className={"p-2 " + (r.llmFailRatePct > 5 ? "text-rose-300" : "text-slate-400")}>
                      {fmt(r.llmFailures)}{r.llmFailRatePct > 0 ? ` (${r.llmFailRatePct}%)` : ""}
                    </td>
                    <td className="p-2">{fmt(r.avgLatencyMs)} ms</td>
                    <td className="p-2 font-mono text-xs">{fmt(r.waSent)} / {fmt(r.waFailed)}</td>
                    <td className={"p-2 " + (r.sendSuccessRatePct !== null && r.sendSuccessRatePct < 90 ? "text-rose-300" : "text-emerald-300")}>
                      {r.sendSuccessRatePct === null ? "—" : `${r.sendSuccessRatePct}%`}
                    </td>
                    <td className="p-2 font-mono text-xs">{fmt(r.outboundMessages)} / {fmt(r.inboundMessages)}</td>
                    <td className="p-2 text-[10px] text-slate-400 font-mono">{r.providers.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-500 mt-4">
          نجاح الإرسال = (مُرسل/مُستلم/مقروء) ÷ (مُرسل + فاشل). الأعمدة الفارغة (—)
          تعني عدم وجود محاولات إرسال في النافذة. تُحدّث الأرقام عند فتح الصفحة.
        </p>
      </div>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const border = tone === "warn" ? "border-rose-500/30" : "border-white/5";
  return (
    <div className={`card p-4 border ${border}`}>
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}
