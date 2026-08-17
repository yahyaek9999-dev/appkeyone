"use client";

import { useState, useEffect } from "react";
import { Wallet, TrendingDown } from "lucide-react";

type LedgerEntry = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  ref?: string;
  note?: string;
  createdAt: string;
};

type CreditsData = {
  balance: number;
  ledger: LedgerEntry[];
};

const TYPE_LABELS: Record<string, string> = {
  topup: "شحن رصيد",
  debit: "خصم",
  refund: "استرداد",
  adjustment: "تعديل",
};

const TYPE_COLORS: Record<string, string> = {
  topup: "text-emerald-400",
  debit: "text-red-400",
  refund: "text-blue-400",
  adjustment: "text-slate-400",
};

export default function SmsCreditsPage() {
  const [data, setData] = useState<CreditsData | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/sms/credits");
    const d = await res.json();
    setData(d);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (loading) return <p className="p-6 text-center text-slate-500">جاري التحميل...</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="border-b border-white/[0.05] pb-5">
        <h1 className="page-title mb-1">رصيد SMS</h1>
        <p className="page-desc">رصيد SMS وكشف الحساب التفصيلي</p>
      </div>

      {/* Balance card */}
      <div className="rounded-xl border border-white/10 bg-canvas-raised p-6 flex items-center gap-4">
        <div className="rounded-xl bg-brand-500/10 p-4">
          <Wallet className="h-7 w-7 text-brand-400" />
        </div>
        <div>
          <p className="text-sm text-slate-400">الرصيد الحالي</p>
          <p className="text-3xl font-bold text-white">{data.balance.toLocaleString("ar-SA")}</p>
          <p className="text-xs text-slate-500">وحدة رصيد SMS</p>
        </div>
      </div>

      {/* Ledger */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-300">كشف الحساب</h2>
        {data.ledger.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-10 text-center">
            <TrendingDown className="mx-auto mb-2 h-8 w-8 text-slate-600" />
            <p className="text-slate-400">لا توجد حركات بعد.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.07] bg-white/[0.02]">
                  <th className="px-4 py-3 text-right text-xs text-slate-400 font-medium">النوع</th>
                  <th className="px-4 py-3 text-right text-xs text-slate-400 font-medium">المبلغ</th>
                  <th className="px-4 py-3 text-right text-xs text-slate-400 font-medium">الرصيد بعده</th>
                  <th className="px-4 py-3 text-right text-xs text-slate-400 font-medium">ملاحظة</th>
                  <th className="px-4 py-3 text-right text-xs text-slate-400 font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {data.ledger.map(e => (
                  <tr key={e.id} className="bg-canvas-raised hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <span className={`font-medium ${TYPE_COLORS[e.type] ?? "text-slate-400"}`}>{TYPE_LABELS[e.type] ?? e.type}</span>
                    </td>
                    <td className={`px-4 py-3 font-mono font-semibold ${e.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {e.amount > 0 ? "+" : ""}{e.amount}
                    </td>
                    <td className="px-4 py-3 font-mono text-white">{e.balanceAfter}</td>
                    <td className="px-4 py-3 text-slate-400 max-w-[160px] truncate">{e.note ?? e.ref ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(e.createdAt).toLocaleDateString("ar-SA")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-600">لإضافة رصيد، تواصل مع المشرف. تعديل الرصيد متاح عبر Admin فقط.</p>
    </div>
  );
}
