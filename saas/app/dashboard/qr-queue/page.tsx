/**
 * QR Session Queue dashboard — book a slot on the finite WhatsApp QR session
 * pool. This is SESSION SCHEDULING/RESERVATION over shared capacity, NOT message
 * sending: reserving a slot never triggers the WhatsApp send pipeline.
 *
 * Gated by the "broadcasts" permission. Snapshot + the caller's reservations are
 * loaded server-side in parallel; the interactive booking surface is the client
 * component below.
 */
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { requireAdmin } from "@/lib/admin";
import { getQueueSnapshot, myReservations, qrQueueFlags } from "@/lib/qr-queue";
import { CalendarClock, Users, Activity, Clock } from "lucide-react";
import QrQueueClient from "./qr-queue-client";

export const dynamic = "force-dynamic";

export default async function QrQueuePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "broadcasts")) redirect("/dashboard");
  // QR session booking is retired as a customer product. The scheduler/queue
  // infrastructure stays (QR_QUEUE_ENABLED etc. still tick internally), but the
  // surface is admin-only now — customers connect via Bridge or Meta Cloud.
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }

  const [snapshot, rows] = await Promise.all([
    getQueueSnapshot(),
    myReservations(ctx.user.id),
  ]);

  // Serialize dates to ISO strings for the client component boundary.
  const reservations = rows.map((r) => ({
    id: r.id,
    purpose: r.purpose,
    status: r.status,
    windowStart: r.windowStart.toISOString(),
    windowEnd: r.windowEnd ? r.windowEnd.toISOString() : null,
    durationMin: r.durationMin,
    lane: r.lane,
    priority: r.priority,
    note: r.note,
    reservedAt: r.reservedAt ? r.reservedAt.toISOString() : null,
    activatedAt: r.activatedAt ? r.activatedAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title mb-1">حجز جلسات QR</h1>
        <p className="page-desc">
          احجز فترة زمنية على مجمّع جلسات واتساب (QR) المحدود. هذا حجز لخانة جلسة من
          السعة المشتركة — وليس إرسال رسائل: الحجز لا يبدأ أي إرسال على واتساب.
        </p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={<Users className="h-5 w-5 text-brand-300" />} label="عدد المسارات (Lanes)" value={snapshot.lanes} />
        <Kpi icon={<Activity className="h-5 w-5 text-emerald-300" />} label="نشط الآن" value={snapshot.activeNow} />
        <Kpi icon={<CalendarClock className="h-5 w-5 text-sky-300" />} label="متاح الآن" value={snapshot.availableNow} />
        <Kpi icon={<Clock className="h-5 w-5 text-amber-300" />} label="حجوزات قادمة" value={snapshot.reservedUpcoming} />
      </div>

      {/* Interactive booking + my reservations */}
      <QrQueueClient
        initialReservations={reservations}
        snapshot={snapshot}
        defaultDurationMin={qrQueueFlags.defaultDurationMin}
        horizonDays={qrQueueFlags.horizonDays}
      />
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="kpi-card">
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">{icon}<span className="kpi-label">{label}</span></div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}
