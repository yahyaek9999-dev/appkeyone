/** /admin/payment-methods — manage the 9 payment methods (enable/disable, instructions, reorder). */
import Link from "next/link";
import { listPaymentMethods } from "@/lib/payments-ops/methods";
import PaymentMethodsClient from "./payment-methods-client";

export const dynamic = "force-dynamic";

export default async function PaymentMethodsPage() {
  const methods = await listPaymentMethods();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="page-title mb-1">طرق الدفع (Payment Methods)</h1><p className="page-desc">فعّل/أوقف الطرق، حرّر التعليمات التي يراها العميل، وأعد الترتيب.</p></div>
        <Link href="/admin/payment-accounts" className="btn-secondary text-sm">حسابات الاستلام ←</Link>
      </div>
      <PaymentMethodsClient initial={JSON.parse(JSON.stringify(methods))} />
    </div>
  );
}
