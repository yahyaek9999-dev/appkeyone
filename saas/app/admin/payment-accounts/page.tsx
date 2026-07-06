/** /admin/payment-accounts — manage receiving accounts (create/edit/enable/disable/maintenance/archive/default/reorder). */
import Link from "next/link";
import { listAccounts } from "@/lib/payments-ops/accounts";
import { listPaymentMethods } from "@/lib/payments-ops/methods";
import PaymentAccountsClient from "./payment-accounts-client";

export const dynamic = "force-dynamic";

export default async function PaymentAccountsPage() {
  const [accounts, methods] = await Promise.all([listAccounts(), listPaymentMethods()]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="page-title mb-1">حسابات الاستلام (Payment Accounts)</h1>
          <p className="page-desc">أضف وحرّر حسابات استلام لكل طريقة، فعّل/أوقف، صيانة/أرشفة، عيّن الافتراضي وأعد الترتيب، وشاهد الاستخدام.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/payment-methods" className="btn-secondary text-sm">طرق الدفع</Link>
          <Link href="/dashboard/billing" className="btn-secondary text-sm">معاينة عرض العميل</Link>
        </div>
      </div>
      <PaymentAccountsClient initial={JSON.parse(JSON.stringify(accounts))} methods={JSON.parse(JSON.stringify((methods as any[]).filter((m) => m.enabled)))} />
    </div>
  );
}
