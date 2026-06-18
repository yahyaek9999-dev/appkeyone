/** lib/staff/staff.ts — internal Staff Management (Phase 2/3). */
import { prisma } from "@/lib/db";

export const DEPARTMENTS: Array<{ key: string; label: string }> = [
  { key: "finance", label: "Finance" },
  { key: "support", label: "Support" },
  { key: "operations", label: "Operations" },
  { key: "sales", label: "Sales" },
  { key: "developer", label: "Developer" },
  { key: "admin", label: "Admin" },
];

export const STAFF_ROLES = ["owner", "admin", "finance", "support", "operations", "sales", "developer"];

export async function seedDepartments(): Promise<number> {
  for (const d of DEPARTMENTS) await prisma.staffDepartment.upsert({ where: { key: d.key }, create: d, update: { label: d.label } }).catch(() => {});
  return DEPARTMENTS.length;
}

export async function listDepartments() {
  const rows = await prisma.staffDepartment.findMany({ orderBy: { key: "asc" } });
  if (rows.length === 0) { await seedDepartments(); return prisma.staffDepartment.findMany({ orderBy: { key: "asc" } }); }
  return rows;
}

export async function createStaff(input: { name: string; email: string; role?: string; departmentKey?: string; permissions?: string[] }) {
  return prisma.staffMember.create({
    data: { name: input.name.slice(0, 120), email: input.email.toLowerCase().slice(0, 160), role: input.role || "support", departmentKey: input.departmentKey || "", permissions: JSON.stringify(input.permissions || []) },
  });
}

export async function suspendStaff(id: string, suspend: boolean) {
  return prisma.staffMember.update({ where: { id }, data: { status: suspend ? "suspended" : "active" } });
}

export async function assignStaff(staffId: string, kind: string, refKey: string, note = "") {
  const a = await prisma.staffAssignment.create({ data: { staffId, kind, refKey, note } });
  await prisma.staffMember.update({ where: { id: staffId }, data: { workload: { increment: 1 } } }).catch(() => {});
  return a;
}

export async function notifyStaff(staffId: string, n: { type?: string; title: string; body?: string; refType?: string; refId?: string }) {
  return prisma.staffNotification.create({ data: { staffId, type: n.type || "info", title: n.title.slice(0, 200), body: (n.body || "").slice(0, 1000), refType: n.refType || "", refId: n.refId || null } }).catch(() => null);
}

export async function leastLoadedStaff(departmentKey: string): Promise<string | null> {
  const s = await prisma.staffMember.findFirst({ where: { departmentKey, status: "active" }, orderBy: { workload: "asc" } });
  return s?.id || null;
}

export async function staffForPaymentMethod(methodKey: string): Promise<string | null> {
  const a = await prisma.staffAssignment.findFirst({ where: { kind: "payment_method", refKey: methodKey, active: true } });
  return a?.staffId || null;
}

export async function listStaff() {
  return prisma.staffMember.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
}

export async function getStaffStats() {
  const [total, active, suspended, byDept, byRole, unread] = await Promise.all([
    prisma.staffMember.count(),
    prisma.staffMember.count({ where: { status: "active" } }),
    prisma.staffMember.count({ where: { status: "suspended" } }),
    prisma.staffMember.groupBy({ by: ["departmentKey"], _count: { departmentKey: true } }),
    prisma.staffMember.groupBy({ by: ["role"], _count: { role: true } }),
    prisma.staffNotification.count({ where: { read: false } }),
  ]);
  return {
    total, active, suspended, unreadNotifications: unread,
    byDept: byDept.map((r) => ({ dept: r.departmentKey || "—", count: r._count.departmentKey })),
    byRole: byRole.map((r) => ({ role: r.role, count: r._count.role })),
  };
}
