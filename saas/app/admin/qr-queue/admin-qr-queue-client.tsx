"use client";

/**
 * Admin QR Live Operations Board — interactive reservation control center.
 *
 * Buckets reservations into Active / Waiting / Expiring-soon / Completed with
 * live countdowns + progress rings, color-coded urgency, and complete/cancel
 * actions via POST /api/admin/qr-queue/[id]. UI only — never touches the
 * WhatsApp send pipeline.
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { XCircle, CheckCircle2, Loader2, Clock, PlayCircle, AlarmClock, CheckCheck } from "lucide-react";

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
  booked: "محجوز مبدئيًا", reserved: "محجوز", active: "نشط", completed: "مكتمل",
  canceled: "ملغى", no_show: "لم يحضر", expired: "منتهٍ",
};
const PURPOSE_LABELS: Record<string, string> = {
  session: "جلسة", broadcast: "حملة", import: "استيراد", maintenance: "صيانة", custom: "مخصّص",
};
const FINAL = new Set(["completed", "canceled", "no_show", "expired"]);
const ms = (v: string | Date | null) => { if (!v) return 0; const d = typeof v === "string" ? new Date(v) : v; const t = d.getTime(); return isNaN(t) ? 0 : t; };

function ProgressRing({ pct, tone }: { pct: number; tone: string }) {
  const r = 16, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, pct)));
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0">
      <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-white/10" />
      <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
        className={tone} strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 20 20)" style={{ transition: "stroke-dashoffset 1s linear" }} />
      <text x="20" y="24" textAnchor="middle" className="fill-slate-300 text-[10px] font-bold">{Math.round(Math.max(0, Math.min(1, pct)) * 100)}%</text>
    </svg>
  );
}

export default function AdminQrQueueClient({ initial }: { initial: AdminReservationRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  async function act(id: string, action: "cancel" | "complete") {
    setBusyId(id); setError(null);
    try {
      const res = await fetch(`/api/admin/qr-queue/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) { setError(data?.error === "not_found" ? "الحجز غير موجود." : "تعذّر تنفيذ الإجراء."); return; }
      startTransition(() => router.refresh());
    } catch { setError("تعذّر الاتصال بالخادم."); } finally { setBusyId(null); }
  }

  const buckets = useMemo(() => {
    const active: AdminReservationRow[] = [], waiting: AdminReservationRow[] = [], expiring: AdminReservationRow[] = [], completed: AdminReservationRow[] = [];
    for (const r of initial) {
      if (FINAL.has(r.status)) { completed.push(r); continue; }
      const end = ms(r.windowEnd), left = end - now;
      if (end && left <= 5 * 60 * 1000) expiring.push(r);       // ends within 5 min or overdue
      else if (r.status === "active") active.push(r);
      else waiting.push(r);
    }
    return { active, waiting, expiring, completed: completed.slice(0, 8) };
  }, [initial, now]);

  function countdown(r: AdminReservationRow) {
    const end = ms(r.windowEnd); if (!end) return { text: "—", tone: "text-slate-400" };
    const left = end - now;
    if (left <= 0) return { text: "تجاوز الوقت", tone: "text-rose-300" };
    const total = Math.floor(left / 1000), h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    const text = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
    const tone = left <= 5 * 60000 ? "text-amber-300" : "text-emerald-300";
    return { text, tone };
  }
  function progress(r: AdminReservationRow) {
    const start = ms(r.windowStart), end = ms(r.windowEnd);
    if (!start || !end || end <= start) return 0;
    return (now - start) / (end - start);
  }

  const Card = ({ r, ring }: { r: AdminReservationRow; ring?: boolean }) => {
    const cd = countdown(r), pct = progress(r), isBusy = busyId === r.id || pending;
    const overdue = ms(r.windowEnd) && ms(r.windowEnd) - now <= 0;
    return (
      <div className={"rounded-xl border p-3 " + (overdue ? "border-rose-500/40 bg-rose-500/[0.05]" : "border-white/10 bg-white/[0.03]")}>
        <div className="flex items-start gap-3">
          {ring && <ProgressRing pct={pct} tone={overdue ? "text-rose-400" : pct > 0.8 ? "text-amber-400" : "text-emerald-400"} />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono text-slate-300 truncate">{r.email}</span>
              <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">{PURPOSE_LABELS[r.purpose] || r.purpose}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px]">
              <span className="text-slate-500">المسار {r.lane ?? "—"}</span>
              {r.priority ? <span className="rounded bg-gold-500/15 px-1 text-gold-300">أولوية {r.priority}</span> : null}
              {ms(r.windowEnd) ? <span className={"font-mono " + cd.tone}>⏳ {cd.text}</span> : null}
            </div>
            {!FINAL.has(r.status) && (
              <div className="mt-2 flex gap-1.5">
                <button onClick={() => act(r.id, "complete")} disabled={isBusy} className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50">
                  {busyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} إنهاء
                </button>
                <button onClick={() => act(r.id, "cancel")} disabled={isBusy} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-500/20 disabled:opacity-50">
                  {busyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />} إلغاء
                </button>
              </div>
            )}
            {FINAL.has(r.status) && <div className="mt-1 text-[10px] text-slate-500">{STATUS_LABELS[r.status] || r.status}</div>}
          </div>
        </div>
      </div>
    );
  };

  const Column = ({ title, icon, rows, tone, ring }: { title: string; icon: React.ReactNode; rows: AdminReservationRow[]; tone: string; ring?: boolean }) => (
    <div className="card p-3 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className={"flex items-center gap-1.5 text-sm font-bold " + tone}>{icon}{title}</div>
        <span className={"rounded-full px-2 py-0.5 text-xs font-bold " + tone + " bg-white/5"}>{rows.length}</span>
      </div>
      <div className="space-y-2 min-h-[60px]">
        {rows.length === 0 ? <div className="text-center text-xs text-slate-600 py-6">—</div> : rows.map((r) => <Card key={r.id} r={r} ring={ring} />)}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg">مركز عمليات الجلسات المباشر</h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span>
          مباشر · {new Date(now).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>
      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-2.5 text-xs text-rose-200">{error}</div>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Column title="نشطة الآن" icon={<PlayCircle className="h-4 w-4" />} tone="text-emerald-300" rows={buckets.active} ring />
        <Column title="قيد الانتظار" icon={<Clock className="h-4 w-4" />} tone="text-sky-300" rows={buckets.waiting} />
        <Column title="تنتهي قريبًا" icon={<AlarmClock className="h-4 w-4" />} tone="text-amber-300" rows={buckets.expiring} ring />
        <Column title="مكتملة مؤخرًا" icon={<CheckCheck className="h-4 w-4" />} tone="text-brand-200" rows={buckets.completed} />
      </div>
      <p className="text-xs text-slate-500">العدّادات والحلقات تُحدّث كل ثانية. «إنهاء» يُكمل الجلسة و«إلغاء» يُلغي الحجز — الحجوزات المنتهية للقراءة فقط.</p>
    </div>
  );
}
