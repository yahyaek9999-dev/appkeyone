"use client";

import { useState, useCallback, useEffect } from "react";
import {
  CalendarClock,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  Activity,
  Users,
} from "lucide-react";

type Reservation = {
  id: string;
  purpose: string;
  status: string;
  windowStart: string;
  windowEnd: string | null;
  durationMin: number;
  lane: number | null;
  priority: number;
  note: string | null;
  reservedAt: string | null;
  activatedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

type Snapshot = {
  lanes: number;
  activeNow: number;
  reservedUpcoming: number;
  availableNow: number;
  nextWindowISO: string | null;
};

const PURPOSES: Array<{ v: string; l: string }> = [
  { v: "session", l: "جلسة" },
  { v: "broadcast", l: "بث جماعي" },
  { v: "import", l: "استيراد" },
  { v: "maintenance", l: "صيانة" },
];

const STATUS_LABEL: Record<string, string> = {
  reserved: "محجوز",
  active: "نشط الآن",
  completed: "مكتمل",
  canceled: "ملغي",
  expired: "منتهي",
  no_show: "لم يحضر",
  booked: "محجوز",
};

const STATUS_TONE: Record<string, string> = {
  reserved: "bg-sky-500/15 text-sky-300",
  booked: "bg-sky-500/15 text-sky-300",
  active: "bg-emerald-500/15 text-emerald-300",
  completed: "bg-slate-500/15 text-slate-300",
  canceled: "bg-rose-500/15 text-rose-300",
  expired: "bg-amber-500/15 text-amber-300",
  no_show: "bg-rose-500/15 text-rose-300",
};

// Statuses where the reservation is final and cannot be canceled.
const FINAL_STATUSES = new Set(["completed", "canceled", "expired", "no_show"]);

// Arabic translations for engine rejection reasons.
const REASON_LABEL: Record<string, string> = {
  queue_disabled: "نظام الحجز غير مُفعّل حاليًا.",
  invalid_start: "وقت البداية غير صالح.",
  invalid_window: "الفترة الزمنية غير صالحة.",
  too_long: "المدة تتجاوز الحد الأقصى المسموح به.",
  in_the_past: "لا يمكن الحجز في وقت ماضٍ.",
  beyond_horizon: "الموعد أبعد من المدى المسموح بالحجز خلاله.",
  tenant_limit_reached: "وصلت إلى الحد الأقصى لعدد حجوزاتك.",
  no_capacity: "لا توجد سعة متاحة في هذه الفترة.",
};

const inputCls =
  "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-400/50 focus:outline-none";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
}

// Convert an ISO instant to the `value` a <input type="datetime-local"> expects
// (local wall-clock, no timezone suffix).
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function QrQueueClient({
  initialReservations,
  snapshot,
  defaultDurationMin,
  horizonDays,
}: {
  initialReservations: Reservation[];
  snapshot: Snapshot;
  defaultDurationMin: number;
  horizonDays: number;
}) {
  const [reservations, setReservations] = useState<Reservation[]>(initialReservations);
  const [purpose, setPurpose] = useState("session");
  const [windowStart, setWindowStart] = useState("");
  const [durationMin, setDurationMin] = useState(String(defaultDurationMin));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [suggestionISO, setSuggestionISO] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch("/api/qr-queue/reservations");
      const j = await r.json();
      if (j.ok) setReservations(j.reservations || []);
    } catch {
      /* ignore */
    } finally {
      setRefreshing(false);
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setSuggestionISO(null);

    if (!windowStart) {
      setMsg({ ok: false, text: "اختر وقت بداية الحجز" });
      return;
    }
    const start = new Date(windowStart);
    if (isNaN(start.getTime())) {
      setMsg({ ok: false, text: "وقت البداية غير صالح" });
      return;
    }

    const dur = parseInt(durationMin, 10);
    setBusy(true);
    try {
      const r = await fetch("/api/qr-queue/reservations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose,
          windowStart: start.toISOString(),
          durationMin: Number.isFinite(dur) ? dur : undefined,
          note: note || undefined,
        }),
      });
      const j = await r.json();
      if (r.ok && j.ok) {
        setMsg({ ok: true, text: "تم حجز الفترة بنجاح." });
        setNote("");
        await refresh();
      } else {
        const reason: string = j.error || "no_capacity";
        setMsg({ ok: false, text: REASON_LABEL[reason] || "تعذّر إتمام الحجز." });
        if (reason === "no_capacity" && j.suggestionISO) {
          setSuggestionISO(j.suggestionISO);
        }
      }
    } catch {
      setMsg({ ok: false, text: "خطأ في الشبكة" });
    } finally {
      setBusy(false);
    }
  }

  function applySuggestion() {
    if (!suggestionISO) return;
    setWindowStart(isoToLocalInput(suggestionISO));
    setSuggestionISO(null);
    setMsg(null);
  }

  async function cancel(id: string) {
    setCancelingId(id);
    try {
      const r = await fetch(`/api/qr-queue/reservations/${id}`, { method: "DELETE" });
      const j = await r.json();
      if (r.ok && j.ok) {
        await refresh();
      } else {
        setMsg({ ok: false, text: "تعذّر إلغاء الحجز." });
      }
    } catch {
      setMsg({ ok: false, text: "خطأ في الشبكة" });
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Booking form */}
      <div className="card p-5">
        <h2 className="font-bold text-lg flex items-center gap-2 mb-1">
          <CalendarClock className="h-4 w-4 text-brand-300" /> حجز فترة جديدة
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          اختر الغرض ووقت البداية والمدة. يمكن الحجز خلال {horizonDays} يومًا القادمة.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">الغرض</label>
              <select className={inputCls} value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                {PURPOSES.map((p) => (
                  <option key={p.v} value={p.v} className="bg-slate-900">
                    {p.l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">المدة (دقائق)</label>
              <input
                className={inputCls}
                inputMode="numeric"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                placeholder={String(defaultDurationMin)}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">وقت البداية</label>
            <input
              className={inputCls}
              type="datetime-local"
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">ملاحظة (اختياري)</label>
            <input
              className={inputCls}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ملاحظة قصيرة"
            />
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full justify-center disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />} احجز الفترة
          </button>

          {msg && (
            <div className={`text-sm flex items-center gap-1.5 ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
              {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {msg.text}
            </div>
          )}

          {suggestionISO && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <div className="text-amber-200 mb-2">
                أقرب موعد متاح: <b>{fmt(suggestionISO)}</b>
              </div>
              <button type="button" onClick={applySuggestion} className="btn-ghost justify-center text-xs">
                <Clock className="h-3.5 w-3.5" /> استخدم هذا الموعد
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Snapshot summary */}
      <div className="card p-5">
        <h2 className="font-bold text-lg flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-emerald-300" /> حالة المجمّع
        </h2>
        <div className="space-y-3 text-sm">
          <Row icon={<Users className="h-4 w-4 text-brand-300" />} label="عدد المسارات" value={String(snapshot.lanes)} />
          <Row icon={<Activity className="h-4 w-4 text-emerald-300" />} label="نشط الآن" value={String(snapshot.activeNow)} />
          <Row icon={<CalendarClock className="h-4 w-4 text-sky-300" />} label="متاح الآن" value={String(snapshot.availableNow)} />
          <Row icon={<Clock className="h-4 w-4 text-amber-300" />} label="حجوزات قادمة" value={String(snapshot.reservedUpcoming)} />
          <Row
            icon={<CalendarClock className="h-4 w-4 text-slate-300" />}
            label="أقرب نافذة متاحة"
            value={snapshot.nextWindowISO ? fmt(snapshot.nextWindowISO) : "—"}
          />
        </div>
      </div>

      {/* My reservations */}
      <div className="lg:col-span-2">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-300" /> حجوزاتي
            </h2>
            <button onClick={refresh} disabled={refreshing} className="btn-ghost text-xs disabled:opacity-50">
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} تحديث
            </button>
          </div>

          {reservations.length === 0 ? (
            <div className="text-slate-500 text-sm py-8 text-center">لا توجد حجوزات بعد. احجز فترة للبدء.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 border-b border-white/5">
                    <th className="text-right p-2">الحالة</th>
                    <th className="text-right p-2">الغرض</th>
                    <th className="text-right p-2">من</th>
                    <th className="text-right p-2">إلى</th>
                    <th className="text-right p-2">المسار</th>
                    <th className="text-right p-2">المدة</th>
                    <th className="text-right p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.map((r) => {
                    const purposeLabel = PURPOSES.find((p) => p.v === r.purpose)?.l || r.purpose;
                    const isFinal = FINAL_STATUSES.has(r.status);
                    return (
                      <tr key={r.id} className="border-t border-white/5">
                        <td className="p-2">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                              STATUS_TONE[r.status] || "bg-slate-500/15 text-slate-300"
                            }`}
                          >
                            {STATUS_LABEL[r.status] || r.status}
                          </span>
                        </td>
                        <td className="p-2 text-slate-300">{purposeLabel}</td>
                        <td className="p-2 text-slate-400 whitespace-nowrap">{fmt(r.windowStart)}</td>
                        <td className="p-2 text-slate-400 whitespace-nowrap">{fmt(r.windowEnd)}</td>
                        <td className="p-2 text-slate-300">{r.lane != null ? r.lane : "—"}</td>
                        <td className="p-2 text-slate-400 whitespace-nowrap">{r.durationMin} د</td>
                        <td className="p-2 text-left">
                          {!isFinal && (
                            <button
                              onClick={() => cancel(r.id)}
                              disabled={cancelingId === r.id}
                              className="btn-ghost text-xs text-rose-300 disabled:opacity-50"
                            >
                              {cancelingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />} إلغاء
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-slate-400">
        {icon}
        {label}
      </span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}
