/** /admin/incidents — incident management (Phase 4/6). Auto-routed to departments. */
import { prisma } from "@/lib/db";
import { getIncidentStats } from "@/lib/incidents/engine";
import IncidentsClient from "./incidents-client";

export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const [stats, open] = await Promise.all([
    getIncidentStats(),
    prisma.incident.findMany({ where: { status: { in: ["open", "assigned"] } }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">الحوادث (Incidents)</h1>
      <p className="page-desc">كشف تلقائي للأعطال (مدفوعات/محفظة/بثّ/API/دماغ/QR) وتوجيه تلقائي للقسم المسؤول.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="مفتوحة" value={stats.open} />
        {stats.byDept.slice(0, 3).map((d) => <Tile key={d.dept} label={`قسم ${d.dept}`} value={d.count} />)}
      </div>
      <IncidentsClient initial={JSON.parse(JSON.stringify(open))} />
    </div>
  );
}
function Tile({ label, value }: { label: string; value: number }) {
  return <div className="card p-4"><div className="text-slate-400 text-sm mb-1">{label}</div><div className="text-2xl font-extrabold">{value.toLocaleString()}</div></div>;
}
