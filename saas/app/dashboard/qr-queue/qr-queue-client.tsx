"use client";

import { useState, useCallback, useEffect } from "react";
import {
  CalendarClock,
  Loader2,
  CheckCircle2,
  XCircle,
  Activity,
  Clock,
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

type Slot = {
  startISO: string;
  endISO: string;
  hour: number;
  available: number;
  capacity: number;
  state: "past" | "available" | "busy" | "full";
};

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
const FINAL_STATUSES = new Set(["completed", "canceled", "expired", "no_show"]);

const WEEKDAYS_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function hourLabel(h: number): string {
  const period = h < 12 ? "ص" : "م";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${period}`;
}
function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
}

export default function QrQueueClient({
  initialReservations,
  snapshot,
  horizonDays,
}: {
  initialReservations: Reservation[];
  snapshot: Snapshot;
  defaultDurationMin: number;
  horizonDays: number;
}) {
  const [reservations, setReservations] = useState<Reservation[]>(initialReservations);
  const [days] = useState<Date[]>(() => {
    const out: Date[] = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 0; i < Math.min(horizonDays, 14); i++) {
      out.push(new Date(base.getTime() + i * 86400000));
    }
    return out;
  });
  const [selected, setSelected] = useState<string>(() => ymd(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingISO, setBookingISO] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadSlots = useCallback(async (date: string) => {
    setLoadingSlots(true);
    try {
      const r = await fetch(`/api/qr-queue/availability/day?date=${date}`);
      const j = await r.json();
      setSlots(j.ok ? j.slots || [] : []);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  const refreshReservations = useCallback(async () => {
    try {
      const r = await fetch("/api/qr-queue/reservations");
      const j = await r.json();
      if (j.ok) setReservations(j.reservations || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadSlots(selected);
  }, [selected, loadSlots]);

  async function book(slot: Slot) {
    if (slot.state === "full" || slot.state === "past") return;
    setBookingISO(slot.startISO);
    setMsg(null);
    try {
      const r = await fetch("/api/qr-queue/reservations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ windowStart: slot.startISO, durationMin: 60, purpose: "session" }),
      });
      const j = await r.json();
      if (r.ok && j.ok) {
        setMsg({ ok: true, text: `تم حجز ${hourLabel(slot.hour)} بنجاح.` });
        await Promise.all([loadSlots(selected), refreshReservations()]);
      } else {
        setMsg({ ok: false, text: j.reason === "no_capacity" ? "هذه الفترة ممتلئة." : "تعذّر إتمام الحجز." });
        await loadSlots(selected);
      }
    } catch {
      setMsg({ ok: false, text: "خطأ في الشبكة" });
    } finally {
      setBookingISO(null);
    }
  }

  async function cancel(id: string) {
    setCancelingId(id);
    try {
      const r = await fetch(`/api/qr-queue/reservations/${id}`, { method: "DELETE" });
      const j = await r.json();
      if (r.ok && j.ok) await Promise.all([refreshReservations(), loadSlots(selected)]);
      else setMsg({ ok: false, text: "تعذّر إلغاء الحجز." });
    } finally {
      setCancelingId(null);
    }
  }

  const visibleSlots = slots.filter((s) => s.state !== "past" || s.hour >= new Date().getHours());
  const occupancyPct = snapshot.lanes > 0 ? Math.round((snapshot.activeNow / snapshot.lanes) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Live occupancy bar */}
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 font-semibold text-white">
            <Activity className="h-4 w-4 text-emerald-300" /> الإشغال المباشر
          </span>
          <span className="text-slate-400">
            {snapshot.activeNow} / {snapshot.lanes} مسار مشغول · {snapshot.availableNow} متاح الآن
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className={`h-full rounded-full ${occupancyPct >= 100 ? "bg-rose-400" : occupancyPct >= 60 ? "bg-amber-400" : "bg-emerald-400"}`}
            style={{ width: `${Math.min(100, occupancyPct)}%` }}
          />
        </div>
      </div>

      {/* Calendar: day tabs */}
      <div className="card p-5">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
          <CalendarClock className="h-4 w-4 text-brand-300" /> احجز فترة جلسة
        </h2>
        <p className="mb-4 text-xs text-slate-500">اختر اليوم ثم اضغط على فترة متاحة — حجز بضغطة واحدة، بدون إدخال تاريخ يدوي.</p>

        <div className="mb-4 flex flex-wrap gap-2">
          {days.map((d, i) => {
            const key = ymd(d);
            const label = i === 0 ? "اليوم" : i === 1 ? "غدًا" : `${WEEKDAYS_AR[d.getDay()]} ${d.getDate()}`;
            const active = key === selected;
            return (
              <button
                key={key}
                onClick={() => setSelected(key)}
                className={`rounded-lg border px-3 py-1.5 text-xs ${active ? "border-brand-400/60 bg-brand-500/15 text-brand-100" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-slate-400">
          <Legend tone="bg-emerald-400" label="متاح" />
          <Legend tone="bg-amber-400" label="مشغول جزئياً" />
          <Legend tone="bg-rose-400" label="ممتلئ" />
        </div>

        {/* Slot grid */}
        {loadingSlots ? (
          <div className="flex items-center justify-center py-10 text-slate-500"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : visibleSlots.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">لا توجد فترات متاحة في هذا اليوم.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {visibleSlots.map((s) => {
              const tone =
                s.state === "full" ? "border-rose-500/30 bg-rose-500/10 text-rose-300 cursor-not-allowed"
                : s.state === "busy" ? "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
                : s.state === "past" ? "border-white/5 bg-white/[0.02] text-slate-600 cursor-not-allowed"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20";
              const disabled = s.state === "full" || s.state === "past" || bookingISO === s.startISO;
              return (
                <button
                  key={s.startISO}
                  onClick={() => book(s)}
                  disabled={disabled}
                  title={`${s.available}/${s.capacity} متاح`}
                  className={`flex flex-col items-center rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors ${tone}`}
                >
                  {bookingISO === s.startISO ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <span>{hourLabel(s.hour)}</span>
                      <span className="mt-0.5 text-[10px] opacity-80">
                        {s.state === "full" ? "ممتلئ" : `${s.available}/${s.capacity}`}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {msg && (
          <div className={`mt-3 flex items-center gap-1.5 text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
            {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {msg.text}
          </div>
        )}
      </div>

      {/* My reservations */}
      <div className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <Clock className="h-4 w-4 text-brand-300" /> حجوزاتي
        </h2>
        {reservations.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">لا توجد حجوزات بعد — اختر فترة من التقويم أعلاه.</p>
        ) : (
          <div className="space-y-2">
            {reservations.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-[11px] ${STATUS_TONE[r.status] || "bg-white/10 text-slate-300"}`}>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                    <span className="text-slate-300">{fmt(r.windowStart)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">المدة: {r.durationMin} دقيقة{r.lane != null ? ` · مسار ${r.lane}` : ""}</div>
                </div>
                {!FINAL_STATUSES.has(r.status) && (
                  <button
                    onClick={() => cancel(r.id)}
                    disabled={cancelingId === r.id}
                    className="shrink-0 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    {cancelingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "إلغاء"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${tone}`} /> {label}
    </span>
  );
}
