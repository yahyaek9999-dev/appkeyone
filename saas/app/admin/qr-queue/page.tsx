/**
 * Admin QR Queue management.
 *
 * Read + control surface for the QR Session Queue: live capacity snapshot,
 * windowed analytics (utilization / no-show / wait), and the most recent
 * reservations with admin cancel/complete actions. Admin-gated by
 * app/admin/layout.tsx. Mutations go through the QR-queue engine via
 * /api/admin/qr-queue/[id] — this never touches the WhatsApp send pipeline.
 */
import { prisma } from "@/lib/db";
import { getQueueAnalytics, getQueueSnapshot } from "@/lib/qr-queue";
import {
  CalendarClock, PlayCircle, CheckCircle2, Gauge, AlertCircle, Clock, Users,
} from "lucide-react";
import AdminQrQueueClient, { type AdminReservationRow } from "./admin-qr-queue-client";

export const dynamic = "force-dynamic";

export default async function AdminQrQueuePage() {
  const [analytics, snapshot, reservations] = await Promise.all([
    getQueueAnalytics({ days: 30 }).catch(() => null),
    getQueueSnapshot().catch(() => null),
    prisma.qrReservation
      .findMany({ orderBy: { windowStart: "desc" }, take: 100 })
      .catch(() => [] as any[]),
  ]);

  // Resolve tenant emails for the reservation rows in one extra query.
  const userIds = Array.from(new Set(reservations.map((r: any) => r.userId).filter(Boolean)));
  const users = userIds.length
    ? await prisma.user
        .findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
        .catch(() => [] as Array<{ id: string; email: string }>)
    : [];
  const emailById = new Map(users.map((u) => [u.id, u.email]));

  const rows: AdminReservationRow[] = reservations.map((r: any) => ({
    id: r.id,
    email: emailById.get(r.userId) || "—",
    purpose: r.purpose,
    status: r.status,
    windowStart: r.windowStart,
    windowEnd: r.windowEnd,
    durationMin: r.durationMin,
    lane: r.lane,
    priority: r.priority,
  }));

  const a = analytics;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">طابور جلسات QR</h1>
        <p className="page-desc">
          سعة الطابور المباشرة، الإشغال، والحجوزات الأخيرة مع إمكانية الإلغاء والإنهاء — للقراءة والإدارة. لا يمسّ مسار إرسال واتساب.
        </p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Tile icon={<CalendarClock className="h-5 w-5 text-brand-300" />} label="عدد المسارات" value={(snapshot?.lanes ?? a?.lanes ?? 0).toLocaleString()} />
        <Tile icon={<PlayCircle className="h-5 w-5 text-emerald-300" />} label="نشط الآن" value={(snapshot?.activeNow ?? 0).toLocaleString()} />
        <Tile icon={<Users className="h-5 w-5 text-sky-300" />} label="متاح الآن" value={(snapshot?.availableNow ?? 0).toLocaleString()} />
        <Tile icon={<Gauge className="h-5 w-5 text-emerald-300" />} label="نسبة الإشغال (30 يوم)" value={`${a?.utilizationPct ?? 0}%`} />
        <Tile icon={<AlertCircle className={"h-5 w-5 " + ((a?.noShowRatePct || 0) > 0 ? "text-amber-300" : "text-slate-400")} />} label="نسبة عدم الحضور" value={`${a?.noShowRatePct ?? 0}%`} tone={(a?.noShowRatePct || 0) > 20 ? "warn" : "ok"} />
        <Tile icon={<CheckCircle2 className="h-5 w-5 text-brand-300" />} label="محجوز قادم" value={(snapshot?.reservedUpcoming ?? 0).toLocaleString()} />
      </div>

      {/* Secondary analytics tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={<Clock className="h-5 w-5 text-brand-300" />} label="متوسط الانتظار" value={`${a?.avgWaitSec ?? 0} ث`} />
        <Tile icon={<CalendarClock className="h-5 w-5 text-sky-300" />} label="إجمالي الحجوزات (الفترة)" value={(a?.totals?.reservations ?? 0).toLocaleString()} />
        <Tile icon={<CheckCircle2 className="h-5 w-5 text-emerald-300" />} label="مكتملة" value={(a?.totals?.completed ?? 0).toLocaleString()} />
        <Tile icon={<AlertCircle className={"h-5 w-5 " + ((a?.totals?.noShow || 0) > 0 ? "text-amber-300" : "text-slate-400")} />} label="لم تحضر" value={(a?.totals?.noShow ?? 0).toLocaleString()} tone={(a?.totals?.noShow || 0) > 0 ? "warn" : "ok"} />
      </div>

      {/* Reservations table + actions */}
      <AdminQrQueueClient initial={rows} />
    </div>
  );
}

function Tile({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: "ok" | "warn" }) {
  const border = tone === "warn" ? "border-rose-500/30" : "border-white/5";
  return (
    <div className={`card p-4 border ${border}`}>
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">{icon}<span>{label}</span></div>
      <div className="text-2xl font-extrabold">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
