"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type Row = {
  userId: string; email: string; name: string | null;
  current: number; planLimit: number; contracted: number | null; effectiveCap: number; remaining: number | null; usagePct: number; overCap: boolean;
};
const inputCls = "w-24 rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-sm text-white focus:border-brand-400/50 focus:outline-none";

export default function CustomerCapClient({ initialRows }: { initialRows: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function save(userId: string) {
    setBusy(userId);
    try {
      const val = edit[userId];
      await fetch("/api/admin/customer-cap", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, contractedCustomers: val === "" ? null : Number(val) }),
      });
      router.refresh();
    } catch {} finally { setBusy(null); }
  }

  if (rows.length === 0) {
    return <div className="card p-8 text-center text-slate-500 text-sm">لا يوجد تجار قريبون من حدّ العملاء حاليًا.</div>;
  }

  return (
    <div className="card p-5 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-400 border-b border-white/5">
            <th className="text-right p-2">التاجر</th>
            <th className="text-right p-2">الحاليون</th>
            <th className="text-right p-2">حدّ الباقة</th>
            <th className="text-right p-2">الحدّ التعاقدي</th>
            <th className="text-right p-2">الحدّ الفعّال</th>
            <th className="text-right p-2">الاستهلاك</th>
            <th className="text-right p-2">تعيين الحدّ التعاقدي</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId} className="border-t border-white/5">
              <td className="p-2">
                <div className="font-semibold truncate max-w-[180px]">{r.name || "—"}</div>
                <div className="text-[10px] text-slate-500 font-mono truncate max-w-[180px]">{r.email}</div>
              </td>
              <td className="p-2 font-bold">{r.current.toLocaleString()}</td>
              <td className="p-2">{r.planLimit ? r.planLimit.toLocaleString() : "∞"}</td>
              <td className="p-2">{r.contracted != null ? r.contracted.toLocaleString() : "—"}</td>
              <td className="p-2">{r.effectiveCap ? r.effectiveCap.toLocaleString() : "∞"}</td>
              <td className={"p-2 " + (r.usagePct >= 90 ? "text-rose-300" : r.usagePct >= 70 ? "text-amber-300" : "text-emerald-300")}>{r.usagePct}%</td>
              <td className="p-2">
                <div className="flex items-center gap-2">
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    placeholder={r.contracted != null ? String(r.contracted) : "—"}
                    value={edit[r.userId] ?? ""}
                    onChange={(e) => setEdit((p) => ({ ...p, [r.userId]: e.target.value }))}
                  />
                  <button onClick={() => save(r.userId)} disabled={busy === r.userId} className="btn-outline px-2.5 py-1 text-xs disabled:opacity-40">
                    {busy === r.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "حفظ"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
