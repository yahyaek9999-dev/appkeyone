/** lib/payments-ops/methods.ts — manual payment methods catalog (Phase 1). */
import { prisma } from "@/lib/db";

export const PAYMENT_METHODS: Array<{ key: string; label: string; kind: string }> = [
  { key: "binance", label: "Binance Pay", kind: "crypto" },
  { key: "usdt_trc20", label: "USDT (TRC20)", kind: "crypto" },
  { key: "vodafone_cash", label: "Vodafone Cash", kind: "wallet" },
  { key: "instapay", label: "InstaPay", kind: "wallet" },
  { key: "bank_transfer", label: "Bank Transfer", kind: "bank" },
  { key: "redotpay", label: "RedotPay", kind: "crypto" },
  { key: "bybit", label: "Bybit", kind: "crypto" },
  { key: "kast", label: "Kast", kind: "gateway" },
  { key: "paypal", label: "PayPal", kind: "gateway" },
];

export async function seedPaymentMethods(): Promise<number> {
  let i = 0;
  for (const m of PAYMENT_METHODS) {
    await prisma.paymentMethod.upsert({ where: { key: m.key }, create: { ...m, sortOrder: i, enabled: true }, update: { label: m.label, kind: m.kind } }).catch(() => {});
    i++;
  }
  return PAYMENT_METHODS.length;
}

export async function listPaymentMethods() {
  const rows = await prisma.paymentMethod.findMany({ orderBy: { sortOrder: "asc" } });
  if (rows.length === 0) { await seedPaymentMethods(); return prisma.paymentMethod.findMany({ orderBy: { sortOrder: "asc" } }); }
  return rows;
}

export async function setPaymentMethod(key: string, patch: { enabled?: boolean; instructions?: string; label?: string }) {
  const data: any = {};
  if (patch.enabled !== undefined) data.enabled = !!patch.enabled;
  if (patch.instructions !== undefined) data.instructions = String(patch.instructions).slice(0, 1000);
  if (patch.label !== undefined) data.label = String(patch.label).slice(0, 80);
  return prisma.paymentMethod.update({ where: { key }, data });
}

/** Reorder a method up/down by swapping sortOrder with its neighbour. */
export async function reorderMethod(key: string, direction: "up" | "down") {
  const m = await prisma.paymentMethod.findUnique({ where: { key } });
  if (!m) return null;
  const sibling = await prisma.paymentMethod.findFirst({
    where: { sortOrder: direction === "up" ? { lt: m.sortOrder } : { gt: m.sortOrder } },
    orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
  });
  if (!sibling) return m;
  await prisma.$transaction([
    prisma.paymentMethod.update({ where: { id: m.id }, data: { sortOrder: sibling.sortOrder } }),
    prisma.paymentMethod.update({ where: { id: sibling.id }, data: { sortOrder: m.sortOrder } }),
  ]);
  return prisma.paymentMethod.findUnique({ where: { key } });
}
