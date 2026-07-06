/** /admin/incidents — incident management with ownership, priority, SLA due date + history. */
import { prisma } from "@/lib/db";
import { getIncidentStats } from "@/lib/incidents/engine";
import { listStaff } from "@/lib/staff/staff";
import IncidentsClient from "./incidents-client";

export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const [stats, open, staff] = await Promise.all([
    getIncidentStats(),
    prisma.incident.findMany({ where: { status: { in: ["open", "assigned"] } }, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], take: 100 }),
    listStaff(),
  ]);
  const ids = open.map((i) => i.id);
  const events = await prisma.incidentEvent.findMany({ where: { incidentId: { in: ids } }, orderBy: { createdAt: "asc" } });
  const eventsByInc: Record<string, any[]> = {};
  for (const e of events) (eventsByInc[e.incidentId] ||= []).push(e);
  const staffMap: Record<string, string> = Object.fromEntries(staff.map((s) => [s.id, s.name]));
  const rows = open.map((i) => ({ ...i, ownerName: i.assignedStaffId ? (staffMap[i.assignedStaffId] || i.assignedStaffId) : null, events: eventsByInc[i.id] || [] }));
  const orphans = open.filter((i) => !i.assignedStaffId).length;

  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">الحوادث (Incidents)</h1>
      <p className="page-desc">كل حادثة لها مالك وقسم وأولوية وموعد استحقاق (SLA) وسجل كامل. لا توجد حوادث بلا مالك.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="مفتوحة" value={stats.open} />
        <Tile label="بلا مالك" value={orphans} warn={orphans > 0} />
        {stats.byDept.slice(0, 2).map((d) => <Tile key={d.dept} label={`قسم ${d.dept}`} value={d.count} />)}
      </div>
      <IncidentsClient initial={JSON.parse(JSON.stringify(rows))} staff={JSON.parse(JSON.stringify(staff.map((s) => ({ id: s.id, name: s.name, dept: s.departmentKey }))))} />
    </div>
  );
}
function Tile({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return <div className="card p-4"><div className="text-slate-400 text-sm mb-1">{label}</div><div className={`text-2xl font-extrabold ${warn ? "text-rose-300" : ""}`}>{value.toLocaleString()}</div></div>;
}
