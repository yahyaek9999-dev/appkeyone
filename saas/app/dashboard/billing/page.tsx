/** /dashboard/billing — customer chooses plan + payment method + submits proof (Phase 1/9). */
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { listPaymentMethods } from "@/lib/payments-ops/methods";
import { listPaymentProofs } from "@/lib/payments-ops/proofs";
import { TIERS } from "@/lib/pricing/catalog";
import BillingClient from "./billing-client";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const [methods, myProofs] = await Promise.all([listPaymentMethods(), listPaymentProofs({ userId: uid, take: 10 })]);
  const plans = TIERS.filter((t) => t.priceUsdMonthly != null).map((t) => ({ slug: t.slug, name: t.name.en, price: t.priceUsdMonthly }));
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">الاشتراك والدفع</h1>
      <p className="page-desc">اختر باقتك وطريقة الدفع، ارفع الإيصال — يعتمده الفريق فيُشحن رصيدك وتُفعّل باقتك تلقائيًا.</p>
      <BillingClient
        plans={plans}
        methods={JSON.parse(JSON.stringify((methods as any[]).filter((m) => m.enabled)))}
        proofs={JSON.parse(JSON.stringify(myProofs))}
      />
    </div>
  );
}
