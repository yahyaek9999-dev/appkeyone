"use client";

// Payment Control Center table — server-side search/filter/sort/pagination.
// Fetches /api/admin/finance/payments; never holds the whole table client-side.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, Loader2, Download, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";

type Row = {
  id: string; userId: string; tenantEmail: string | null; provider: string;
  amountUsd: number; currency: string; status: string; providerRef: string | null;
  ledgerId: string | null; failureReason: string | null; createdAt: string; reconciledAt: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  created: "أُنشئ", pending: "قيد الانتظار", paid: "مدفوع",
  reconciled: "تمت التسوية", failed: "فشل", expired: "منتهٍ", refunded: "مُسترد",
};

function statusBadge(s: string): string {
  if (s === "paid" || s === "reconciled") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/25";
  if (s === "pending" || s === "created") return "bg-amber-500/10 text-amber-300 border-amber-500/25";
  if (s === "failed") return "bg-rose-500/10 text-rose-300 border-rose-500/25";
  if (s === "refunded") return "bg-sky-500/10 text-sky-300 border-sky-500/25";
  return "bg-white/[0.05] text-slate-400 border-white/[0.08]";
}

export default function PaymentsControl({ providers }: { providers: string[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [minUsd, setMinUsd] = useState("");
  const [maxUsd, setMaxUsd] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"createdAt" | "amountUsd">("createdAt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const params = useCallback(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (status) p.set("status", status);
    if (provider) p.set("provider", provider);
    if (minUsd) p.set("minUsd", minUsd);
    if (maxUsd) p.set("maxUsd", maxUsd);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    p.set("sort", sort);
    p.set("dir", dir);
    p.set("page", String(page));
    return p;
  }, [q, status, provider, minUsd, maxUsd, from, to, sort, dir, page]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/finance/payments?${params()}`, { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        setRows(j.rows || []);
        setTotal(j.total || 0);
        setPages(j.pages || 1);
      } catch {
        if (alive) { setRows([]); setTotal(0); setPages(1); }
      } finally {
        if (alive) setLoading(false);
      }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [params]);

  // Any filter change resets to page 1.
  useEffect(() => { setPage(1); }, [q, status, provider, minUsd, maxUsd, from, to, sort, dir]);

  function toggleSort(col: "createdAt" | "amountUsd") {
    if (sort === col) setDir(dir === "desc" ? "asc" : "desc");
    else { setSort(col); setDir("desc"); }
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="معرّف، مرجع البوابة، أو بريد التاجر…"
            className="w-56 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none"
          />
        </div>

        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-sm text-white">
          <option value="">كل الحالات</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select value={provider} onChange={(e) => setProvider(e.target.value)} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-sm text-white">
          <option value="">كل البوابات</option>
          {providers.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        <input type="number" value={minUsd} onChange={(e) => setMinUsd(e.target.value)} placeholder="من $" className="w-20 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-sm text-white placeholder:text-slate-600" />
        <input type="number" value={maxUsd} onChange={(e) => setMaxUsd(e.target.value)} placeholder="إلى $" className="w-20 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-sm text-white placeholder:text-slate-600" />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-sm text-white" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-sm text-white" />

        <a
          href={`/api/admin/finance/payments/export?${params()}`}
          className="ms-auto inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-white/[0.16] hover:bg-white/[0.08]"
        >
          <Download className="h-3.5 w-3.5" /> تصدير CSV
        </a>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5 text-[12px] text-slate-400">
          <span>{loading ? "جارٍ التحميل…" : `${total.toLocaleString()} معاملة`}</span>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-slate-400">
              <tr>
                <th className="p-3 text-right">
                  <button onClick={() => toggleSort("createdAt")} className="inline-flex items-center gap-1 hover:text-white">
                    التاريخ <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="p-3 text-right">التاجر</th>
                <th className="p-3 text-right">البوابة</th>
                <th className="p-3 text-right">
                  <button onClick={() => toggleSort("amountUsd")} className="inline-flex items-center gap-1 hover:text-white">
                    المبلغ <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="p-3 text-right">الحالة</th>
                <th className="p-3 text-right">المحفظة</th>
                <th className="p-3 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">لا معاملات مطابقة للفلاتر.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="p-3 text-xs text-slate-400">{new Date(r.createdAt).toLocaleString("ar-EG")}</td>
                  <td className="p-3 text-xs">
                    {r.tenantEmail ? (
                      <Link href={`/admin/tenants/${r.userId}`} className="text-slate-200 hover:text-brand-300" dir="ltr">{r.tenantEmail}</Link>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="p-3 text-xs text-slate-300" dir="ltr">{r.provider}</td>
                  <td className="p-3 text-sm font-semibold tabular-nums text-white">${r.amountUsd.toFixed(2)}</td>
                  <td className="p-3">
                    <span className={`rounded-md border px-2 py-0.5 text-[11px] ${statusBadge(r.status)}`}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                  </td>
                  <td className="p-3 text-[11px]">
                    {r.ledgerId
                      ? <span className="text-emerald-400">مُضاف</span>
                      : (r.status === "paid" ? <span className="text-rose-400">غير مُضاف</span> : <span className="text-slate-600">—</span>)}
                  </td>
                  <td className="p-3 text-left">
                    <Link href={`/admin/payments/${r.id}`} className="text-[11px] text-brand-300 hover:text-brand-200">التفاصيل ←</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2.5 text-[12px]">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] px-2.5 py-1 text-slate-300 disabled:opacity-40"
          >
            <ChevronRight className="h-3.5 w-3.5" /> السابق
          </button>
          <span className="text-slate-500">صفحة {page} من {pages}</span>
          <button
            disabled={page >= pages}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] px-2.5 py-1 text-slate-300 disabled:opacity-40"
          >
            التالي <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
