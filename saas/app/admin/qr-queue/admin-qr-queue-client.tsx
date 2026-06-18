"use client";

/**
 * Admin QR Queue table — interactive reservation management.
 *
 * Renders recent reservations and lets an admin cancel a holding reservation or
 * mark an active one completed via POST /api/admin/qr-queue/[id]. On success it
 * refreshes the server component so the table + KPIs reflect the new state.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { XCircle, CheckCircle2, Loader2 } from "lucide-react";

export interface AdminReservationRow {
  id: string;
  email: string;
  purpose: string;
  status: string;
  windowStart: string | Date | null;
  windowEnd: string | Date | null;
  durationMin: number | null;
  lane: number | null;
  priority: number | null;
}

const STATUS_LABELS: Record<string, string> = {
  booked: "محجوز مبدئيًا",
  reserved: "محجوز",
  active: "نشط",
  completed: "مكتمل",
  canceled: "ملغى",
  no_show: "لم يحضر",
  expired: "منتهٍ",
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  reserved: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  booked: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  completed: "bg-brand-500/15 text-brand-200 border-brand-500/30",
  canceled: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  no_show: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  expired: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

const FINAL_STATUSES = new Set(["completed", "canceled", "no_show", "expired"]);
const PURPOSE_LABELS: Record<string, string> = {
  session: "جلسة", broadcast: "حملة", import: "استيراد", maintenance: "صيانة", custom: "مخصّص",
};

function fmtTime(v: string | Date | null): string {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-EG", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminQrQueueClient({ initial }: { initial: AdminReservationRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: "cancel" | "complete") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/qr-queue/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(data?.error === "not_found" ? "الحجز غير موجود." : "تعذّر تنفيذ الإجراء.");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("تعذّر الاتصال بالخادم.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card p-5">
      <h2 className="font-bold text-lg mb-4">الحجوزات الأخيرة</h2>
      {error && (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-2.5 text-xs text-rose-200">{error}</div>
      )}
      {initial.length === 0 ? (
        <div className="text-slate-500 text-sm py-8 text-center">لا توجد حجوزات بعد.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/5">
                <th className="text-right p-2">التاجر</th>
                <th className="text-right p-2">الغرض</th>
                <th className="text-right p-2">الحالة</th>
                <th className="text-right p-2">بداية النافذة</th>
                <th className="text-right p-2">نهاية النافذة</th>
                <th className="text-right p-2">المسار</th>
                <th className="text-right p-2">المدة</th>
                <th className="text-right p-2">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {initial.map((r) => {
                const isFinal = FINAL_STATUSES.has(r.status);
                const isBusy = busyId === r.id || pending;
                return (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="p-2">
                      <div className="text-[11px] text-slate-300 font-mono truncate max-w-[200px]">{r.email}</div>
                    </td>
                    <td className="p-2">{PURPOSE_LABELS[r.purpose] || r.purpose}</td>
                    <td className="p-2">
                      <span className={"inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] " + (STATUS_TONE[r.status] || "bg-slate-500/15 text-slate-400 border-slate-500/30")}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                    </td>
                    <td className="p-2 text-slate-300">{fmtTime(r.windowStart)}</td>
                    <td className="p-2 text-slate-400">{fmtTime(r.windowEnd)}</td>
                    <td className="p-2 font-mono text-xs">{r.lane ?? "—"}</td>
                    <td className="p-2 text-slate-400">{r.durationMin ? `${r.durationMin} د` : "—"}</td>
                    <td className="p-2">
                      {isFinal ? (
                        <span className="text-[11px] text-slate-600">—</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => act(r.id, "complete")}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                          >
                            {busyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                            إنهاء
                          </button>
                          <button
                            onClick={() => act(r.id, "cancel")}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                          >
                            {busyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                            إلغاء
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500 mt-4">
        «إنهاء» يُكمل الجلسة، و«إلغاء» يُلغي الحجز. الحجوزات المنتهية لا تقبل إجراءات. تُحدّث القائمة تلقائيًا بعد كل إجراء.
      </p>
    </div>
  );
}
