/**
 * lib/payments-ops/accounts.ts — receiving-account management (closes the
 * "owner can't set up where money lands" critical gap). Create / edit / enable /
 * disable / maintenance / archive / default / reorder, with per-account usage.
 */
import { prisma } from "@/lib/db";

export async function createAccount(input: { methodKey: string; label: string; accountId?: string; note?: string; assignedStaffId?: string | null }) {
  const max = await prisma.paymentAccount.aggregate({ where: { methodKey: input.methodKey }, _max: { sortOrder: true } });
  const count = await prisma.paymentAccount.count({ where: { methodKey: input.methodKey } });
  return prisma.paymentAccount.create({
    data: {
      methodKey: input.methodKey, label: String(input.label).slice(0, 120), accountId: String(input.accountId || "").slice(0, 200),
      note: String(input.note || "").slice(0, 500), assignedStaffId: input.assignedStaffId || null,
      sortOrder: (max._max.sortOrder ?? 0) + 1, isDefault: count === 0, status: "active", enabled: true,
    },
  });
}

export async function listAccounts() {
  const accounts = await prisma.paymentAccount.findMany({ orderBy: [{ methodKey: "asc" }, { sortOrder: "asc" }] });
  const usage = await prisma.paymentProof.groupBy({ by: ["accountId"], _count: { accountId: true } }).catch(() => [] as any[]);
  const usageMap: Record<string, number> = {};
  for (const u of usage) if (u.accountId) usageMap[u.accountId] = u._count.accountId;
  return accounts.map((a) => ({ ...a, usage: usageMap[a.id] || 0 }));
}

export async function setAccount(id: string, patch: { enabled?: boolean; status?: string; isDefault?: boolean; label?: string; accountId?: string; note?: string; assignedStaffId?: string | null }) {
  const acct = await prisma.paymentAccount.findUnique({ where: { id } });
  if (!acct) return null;
  const data: any = {};
  if (patch.enabled !== undefined) data.enabled = !!patch.enabled;
  if (patch.status !== undefined && ["active", "maintenance", "archived"].includes(patch.status)) data.status = patch.status;
  if (patch.label !== undefined) data.label = String(patch.label).slice(0, 120);
  if (patch.accountId !== undefined) data.accountId = String(patch.accountId).slice(0, 200);
  if (patch.note !== undefined) data.note = String(patch.note).slice(0, 500);
  if (patch.assignedStaffId !== undefined) data.assignedStaffId = patch.assignedStaffId || null;
  if (patch.isDefault === true) {
    await prisma.paymentAccount.updateMany({ where: { methodKey: acct.methodKey, id: { not: id } }, data: { isDefault: false } });
    data.isDefault = true;
  }
  return prisma.paymentAccount.update({ where: { id }, data });
}

export async function reorderAccount(id: string, direction: "up" | "down") {
  const acct = await prisma.paymentAccount.findUnique({ where: { id } });
  if (!acct) return null;
  const sibling = await prisma.paymentAccount.findFirst({
    where: { methodKey: acct.methodKey, sortOrder: direction === "up" ? { lt: acct.sortOrder } : { gt: acct.sortOrder } },
    orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
  });
  if (!sibling) return acct;
  await prisma.$transaction([
    prisma.paymentAccount.update({ where: { id: acct.id }, data: { sortOrder: sibling.sortOrder } }),
    prisma.paymentAccount.update({ where: { id: sibling.id }, data: { sortOrder: acct.sortOrder } }),
  ]);
  return prisma.paymentAccount.findUnique({ where: { id } });
}

/** Customer-facing: the enabled, active receiving accounts for a method (for instructions). */
export async function customerAccountsForMethod(methodKey: string) {
  return prisma.paymentAccount.findMany({
    where: { methodKey, enabled: true, status: "active" },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
    select: { id: true, label: true, accountId: true, note: true, isDefault: true },
  });
}
