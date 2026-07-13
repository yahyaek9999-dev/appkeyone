"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GitMerge, Search, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatCustomerPhone } from "@/lib/phone";

type CandidateCustomer = { id: string; name: string | null; phone: string };

export default function MergeCustomerButton({
  customerId,
  customerName,
  customerPhone,
}: {
  customerId: string;
  customerName: string | null;
  customerPhone: string;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CandidateCustomer[]>([]);
  const [merging, setMerging] = useState(false);

  async function search(query: string) {
    setQ(query);
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const r = await fetch(`/api/customers/search?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      const list: CandidateCustomer[] = (j.customers || []).filter((c: any) => c.id !== customerId);
      setResults(list);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function mergeWith(other: CandidateCustomer) {
    const ok = await confirm({
      title: "دمج العميلين",
      body: `سيتم نقل كل محادثات وطلبات وسجلات "${other.name || other.phone}" إلى هذا العميل، ثم حذف السجل المكرر نهائياً. هذا الإجراء لا يمكن التراجع عنه.`,
      confirmLabel: "دمج نهائي",
      cancelLabel: "إلغاء",
      danger: true,
    });
    if (!ok) return;
    setMerging(true);
    try {
      const r = await fetch("/api/customers/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survivorId: customerId, absorbedId: other.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        success("تم دمج العميلين بنجاح");
        setOpen(false);
        router.refresh();
      } else {
        error(j.error || "فشل الدمج");
      }
    } catch {
      error("فشل الاتصال بالخادم");
    } finally {
      setMerging(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition"
        title="دمج مع عميل مكرر"
      >
        <GitMerge className="w-4 h-4" />
        دمج مع عميل آخر
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold mb-1 flex items-center gap-2"><GitMerge className="w-4 h-4" /> دمج مع عميل مكرر</h3>
            <p className="text-xs text-slate-400 mb-3">
              ابحث عن السجل المكرر لـ "{customerName || formatCustomerPhone(customerPhone).display}" بالاسم أو الرقم. سيبقى هذا العميل، وسيُحذف الآخر بعد نقل بياناته إليه.
            </p>
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-500" />
              <input
                autoFocus
                value={q}
                onChange={(e) => search(e.target.value)}
                placeholder="اسم أو رقم هاتف..."
                className="w-full bg-white/5 border border-white/10 rounded-lg pr-9 pl-3 py-2 text-sm"
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1.5">
              {searching && <div className="text-xs text-slate-500 text-center py-3"><Loader2 className="w-4 h-4 animate-spin inline" /></div>}
              {!searching && q.trim() && results.length === 0 && (
                <div className="text-xs text-slate-500 text-center py-3">لا نتائج</div>
              )}
              {results.map((c) => (
                <button
                  key={c.id}
                  onClick={() => mergeWith(c)}
                  disabled={merging}
                  className="w-full text-right px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm flex items-center justify-between disabled:opacity-50"
                >
                  <span>{c.name || "بدون اسم"}</span>
                  <bdi dir="ltr" className="text-xs text-slate-400 font-mono">{formatCustomerPhone(c.phone).display}</bdi>
                </button>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm">إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
