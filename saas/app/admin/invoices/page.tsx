// /admin/invoices — Admin visibility over the EXISTING Invoice model.
// Read-only: search by number/tenant, date range, pagination, and links to the
// originating payment. No second invoice-generation system is introduced.
import Link from "next/link";
import { listInvoices } from "@/lib/admin/finance";
import { FileText, Search } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams?: { q?: string; from?: string; to?: string; page?: string };
}) {
  const page = Math.max(1, Number(searchParams?.page || 1));
  const res = await listInvoices({
    q: searchParams?.q,
    from: searchParams?.from,
    to: searchParams?.to,
    page,
    pageSize: 25,
  });

  const qs = (p: number) => {
    const sp = new URLSearchParams();
    if (searchParams?.q) sp.set("q", searchParams.q);
    if (searchParams?.from) sp.set("from", searchParams.from);
    if (searchParams?.to) sp.set("to", searchParams.to);
    sp.set("page", String(p));
    return `/admin/invoices?${sp}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title mb-1">الفواتير</h1>
        <p className="page-desc">الفواتير الصادرة فعلياً عن معاملات الدفع الناجحة — {res.total.toLocaleString()} فاتورة.</p>
      </div>

      <form action="/admin/invoices" method="get" className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-slate-500" />
          <input
            name="q"
            defaultValue={searchParams?.q || ""}
            placeholder="رقم الفاتورة أو بريد التاجر…"
            className="w-56 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none"
          />
        </div>
        <input type="date" name="from" defaultValue={searchParams?.from || ""} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-sm text-white" />
        <input type="date" name="to" defaultValue={searchParams?.to || ""} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-sm text-white" />
        <button type="submit" className="btn-primary text-sm">بحث</button>
        {(searchParams?.q || searchParams?.from || searchParams?.to) && (
          <Link href="/admin/invoices" className="text-xs text-slate-500 hover:text-slate-300">مسح الفلتر</Link>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-slate-400">
              <tr>
                <th className="p-3 text-right">رقم الفاتورة</th>
                <th className="p-3 text-right">التاجر</th>
                <th className="p-3 text-right">المبلغ</th>
                <th className="p-3 text-right">الوصف</th>
                <th className="p-3 text-right">تاريخ الإصدار</th>
                <th className="p-3 text-right">المعاملة</th>
              </tr>
            </thead>
            <tbody>
              {res.rows.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-slate-500">لا فواتير مطابقة.</td></tr>
              )}
              {res.rows.map((inv: any) => (
                <tr key={inv.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-white" dir="ltr">
                      <FileText className="h-3.5 w-3.5 text-slate-500" />
                      {inv.number}
                    </span>
                  </td>
                  <td className="p-3 text-xs">
                    {inv.tenantEmail ? (
                      <Link href={`/admin/tenants/${inv.userId}`} className="text-slate-200 hover:text-brand-300" dir="ltr">{inv.tenantEmail}</Link>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="p-3 font-semibold tabular-nums text-white">${inv.amountUsd.toFixed(2)} <span className="text-[11px] text-slate-500">{inv.currency}</span></td>
                  <td className="p-3 text-[12px] text-slate-400">{inv.description || "—"}</td>
                  <td className="p-3 text-xs text-slate-400">{new Date(inv.issuedAt).toLocaleString("ar-EG")}</td>
                  <td className="p-3">
                    <Link href={`/admin/payments/${inv.paymentTransactionId}`} className="text-[11px] text-brand-300 hover:text-brand-200">
                      عرض المعاملة ←
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2.5 text-[12px]">
          {page > 1 ? <Link href={qs(page - 1)} className="rounded-lg border border-white/[0.08] px-2.5 py-1 text-slate-300">السابق</Link> : <span />}
          <span className="text-slate-500">صفحة {page} من {res.pages}</span>
          {page < res.pages ? <Link href={qs(page + 1)} className="rounded-lg border border-white/[0.08] px-2.5 py-1 text-slate-300">التالي</Link> : <span />}
        </div>
      </div>
    </div>
  );
}
