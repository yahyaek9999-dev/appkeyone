// /admin/payments/[id] — Payment detail.
// Shows only REAL relationships: tenant, subscription, wallet ledger effect,
// invoice, topup request, refunds. Never renders gateway credentials/secrets.
import { notFound } from "next/navigation";
import Link from "next/link";
import { getPaymentDetail } from "@/lib/admin/finance";
import { CreditCard, Wallet, FileText, User, ArrowLeft, RotateCcw } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  created: "أُنشئ", pending: "قيد الانتظار", paid: "مدفوع",
  reconciled: "تمت التسوية", failed: "فشل", expired: "منتهٍ", refunded: "مُسترد",
};

function badge(s: string): string {
  if (s === "paid" || s === "reconciled") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/25";
  if (s === "pending" || s === "created") return "bg-amber-500/10 text-amber-300 border-amber-500/25";
  if (s === "failed") return "bg-rose-500/10 text-rose-300 border-rose-500/25";
  if (s === "refunded") return "bg-sky-500/10 text-sky-300 border-sky-500/25";
  return "bg-white/[0.05] text-slate-400 border-white/[0.08]";
}

function fmt(d: Date | string | null | undefined): string {
  return d ? new Date(d).toLocaleString("ar-EG") : "—";
}

export default async function PaymentDetailPage({ params }: { params: { id: string } }) {
  const d = await getPaymentDetail(params.id);
  if (!d) notFound();
  const p = d.payment;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center gap-2">
        <Link href="/admin/payments" className="text-[12px] text-slate-400 hover:text-white">
          <ArrowLeft className="inline h-3.5 w-3.5" /> كل المدفوعات
        </Link>
      </div>

      {/* Header */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-brand-300" />
              <span className="text-2xl font-bold tabular-nums text-white">${p.amountUsd.toFixed(2)}</span>
              <span className="text-sm text-slate-500">{p.currency}</span>
              <span className={`rounded-md border px-2 py-0.5 text-[11px] ${badge(p.status)}`}>
                {STATUS_LABELS[p.status] || p.status}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-400">
              <code className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px]" dir="ltr">{p.id}</code>
              <span>البوابة: <b className="text-slate-200" dir="ltr">{p.provider}</b></span>
              <span>{fmt(p.createdAt)}</span>
            </div>
          </div>
        </div>

        {p.failureReason && (
          <div className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/[0.05] px-3 py-2 text-[12px] text-rose-200">
            سبب الفشل: {p.failureReason}
          </div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Transaction */}
        <Card title="المعاملة" icon={<CreditCard className="h-4 w-4" />}>
          <Row k="مرجع البوابة" v={p.providerRef || "—"} mono />
          <Row k="معرّف الطلب لدى البوابة" v={p.providerOrderId || "—"} mono />
          <Row k="مرجع idempotency" v={p.intentRef || "—"} mono />
          <Row k="المبلغ (وحدات صغرى)" v={String(p.amountMinor ?? 0)} />
          <Row k="تاريخ التسوية" v={fmt(p.reconciledAt)} />
        </Card>

        {/* Tenant + subscription */}
        <Card title="التاجر والاشتراك" icon={<User className="h-4 w-4" />}>
          {d.tenant ? (
            <>
              <Row
                k="التاجر"
                v={d.tenant.email}
                href={`/admin/tenants/${d.tenant.id}`}
              />
              <Row k="الاسم" v={d.tenant.name || "—"} />
            </>
          ) : (
            <Row k="التاجر" v="غير موجود" />
          )}
          {d.subscription ? (
            <>
              <Row k="الباقة" v={d.subscription.planName} />
              <Row k="حالة الاشتراك" v={d.subscription.status} />
              <Row k="ينتهي في" v={fmt(d.subscription.expiresAt)} />
            </>
          ) : (
            <Row k="الاشتراك" v="لا يوجد" />
          )}
        </Card>

        {/* Wallet effect */}
        <Card title="أثر المحفظة" icon={<Wallet className="h-4 w-4" />}>
          {d.ledger ? (
            <>
              <Row k="القيد" v={d.ledger.id} mono />
              <Row k="النوع" v={`${d.ledger.direction} · ${d.ledger.kind}`} />
              <Row k="المبلغ" v={`$${d.ledger.amountUsd.toFixed(2)}`} />
              <Row k="الرصيد بعد" v={`$${d.ledger.balanceAfterUsd.toFixed(2)}`} />
              <Row k="التاريخ" v={fmt(d.ledger.createdAt)} />
            </>
          ) : (
            <div className="py-3 text-[12px]">
              {p.status === "paid" ? (
                <span className="text-rose-300">
                  ⚠ لا يوجد قيد محفظة رغم أن الدفعة ناجحة —{" "}
                  <Link href="/admin/payments/reconciliation" className="underline">افتح التسوية</Link>
                </span>
              ) : (
                <span className="text-slate-500">لا يوجد أثر على المحفظة.</span>
              )}
            </div>
          )}
          {d.topupRequest && (
            <Row k="طلب الشحن" v={`${d.topupRequest.method} · ${d.topupRequest.status} · $${d.topupRequest.amountUsd.toFixed(2)}`} />
          )}
        </Card>

        {/* Invoice + refunds */}
        <Card title="الفاتورة والاسترداد" icon={<FileText className="h-4 w-4" />}>
          {d.invoice ? (
            <>
              <Row k="رقم الفاتورة" v={d.invoice.number} href="/admin/invoices" mono />
              <Row k="المبلغ" v={`$${d.invoice.amountUsd.toFixed(2)}`} />
              <Row k="تاريخ الإصدار" v={fmt(d.invoice.issuedAt)} />
            </>
          ) : (
            <Row k="الفاتورة" v="لا توجد فاتورة مرتبطة" />
          )}
          {d.refunds.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">الاستردادات</div>
              {d.refunds.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-[12px]">
                  <RotateCcw className="h-3 w-3 text-sky-400" />
                  <span className="text-white">${r.amountUsd.toFixed(2)}</span>
                  <span className="text-slate-500">{r.kind}</span>
                  <span className="text-slate-600">{fmt(r.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : p.status === "refunded" ? (
            <div className="mt-2 text-[12px] text-amber-300">⚠ الحالة "مُستردة" لكن لا يوجد قيد عكسي — تدخّل يدوي مطلوب.</div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {icon} {title}
      </div>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

function Row({ k, v, mono, href }: { k: string; v: string; mono?: boolean; href?: string }) {
  const val = mono ? <span className="font-mono text-[11px]" dir="ltr">{v}</span> : v;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.04] pb-1.5">
      <dt className="shrink-0 text-[12px] text-slate-500">{k}</dt>
      <dd className="min-w-0 truncate text-[13px] font-medium text-white">
        {href ? <Link href={href} className="text-brand-300 hover:text-brand-200">{val}</Link> : val}
      </dd>
    </div>
  );
}
