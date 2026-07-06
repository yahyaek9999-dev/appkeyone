/** /admin/staff — internal staff management (Phase 3). */
import { listStaff, getStaffStats, listDepartments } from "@/lib/staff/staff";
import StaffClient from "./staff-client";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const [staff, stats, depts] = await Promise.all([listStaff(), getStaffStats(), listDepartments()]);
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">إدارة الطاقم (Staff)</h1>
      <p className="page-desc">إنشاء الطاقم، إيقاف، أقسام، عبء العمل — للعمليات الداخلية.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="إجمالي" value={stats.total} />
        <Tile label="نشط" value={stats.active} />
        <Tile label="موقوف" value={stats.suspended} />
        <Tile label="إشعارات غير مقروءة" value={stats.unreadNotifications} />
      </div>
      <StaffClient initial={JSON.parse(JSON.stringify(staff))} departments={JSON.parse(JSON.stringify(depts))} />
    </div>
  );
}
function Tile({ label, value }: { label: string; value: number }) {
  return <div className="card p-4"><div className="text-slate-400 text-sm mb-1">{label}</div><div className="text-2xl font-extrabold">{value.toLocaleString()}</div></div>;
}
