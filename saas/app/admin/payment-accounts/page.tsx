/** /admin/payment-accounts — supported methods + receiving accounts (Phase 1/2). */
import { listPaymentMethods } from "@/lib/payments-ops/methods";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PaymentAccountsPage() {
  const [methods, accounts] = await Promise.all([
    listPaymentMethods(),
    prisma.paymentAccount.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">حسابات الاستلام (Payment Accounts)</h1>
      <p className="page-desc">طرق الدفع المدعومة وحسابات الاستلام المُسندة للطاقم.</p>
      <div className="card p-5">
        <h2 className="font-bold mb-3">طرق الدفع المدعومة (9)</h2>
        <div className="flex flex-wrap gap-2">
          {methods.map((m: any) => (
            <span key={m.key} className={"rounded-full text-xs px-3 py-1 " + (m.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-500")}>{m.label}</span>
          ))}
        </div>
      </div>
      <div className="card p-5 overflow-x-auto">
        <h2 className="font-bold mb-3">الحسابات</h2>
        {accounts.length === 0 ? <p className="text-slate-500 text-sm">لا توجد حسابات — أنشئها عبر <code className="font-mono text-xs">POST /api/admin/payment-accounts</code>.</p> : (
          <table className="w-full text-sm"><thead><tr className="text-slate-400 text-xs"><th className="p-1.5 text-right">الطريقة</th><th className="p-1.5">التسمية</th><th className="p-1.5">المعرّف</th><th className="p-1.5">الموظف</th><th className="p-1.5">مفعّل</th></tr></thead>
            <tbody>{accounts.map((a: any) => <tr key={a.id} className="border-t border-white/5"><td className="p-1.5 font-mono text-xs">{a.methodKey}</td><td className="p-1.5">{a.label}</td><td className="p-1.5 font-mono text-xs text-slate-400">{a.accountId || "—"}</td><td className="p-1.5 font-mono text-xs">{a.assignedStaffId ? String(a.assignedStaffId).slice(0, 8) + "…" : "—"}</td><td className="p-1.5">{a.enabled ? "✓" : "✗"}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
