/** /dashboard/billing — customer chooses plan + payment method + submits proof (Phase 1/9). */
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listPaymentProofs } from "@/lib/payments-ops/proofs";
import { customerPayableMethods } from "@/lib/payments-ops/accounts";
import { PUBLIC_TIERS } from "@/lib/pricing/catalog";
import BillingClient from "./billing-client";

export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: { plan?: string } }) {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const initialPlan = typeof searchParams?.plan === "string" ? searchParams.plan : "";
  const [payableMethods, myProofs, dbPlans] = await Promise.all([
    customerPayableMethods(),
    listPaymentProofs({ userId: uid, take: 12 }),
    prisma.plan.findMany({ select: { slug: true, priceUsd: true, status: true } }),
  ]);
  const dbBySlug = new Map(dbPlans.map((p) => [p.slug, p]));
  // Catalog is the canonical tier list; overlay the admin-editable DB price and
  // hide any plan the owner archived in /admin/plans.
  const plans = PUBLIC_TIERS.filter((t) => t.priceUsdMonthly != null)
    .filter((t) => ((dbBySlug.get(t.slug)?.status as string) ?? "active") !== "archived")
    .map((t) => ({ slug: t.slug, name: t.name.en, price: dbBySlug.get(t.slug)?.priceUsd ?? t.priceUsdMonthly }));
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">الاشتراك والدفع</h1>
      <p className="page-desc">اختر باقتك وطريقة الدفع، ادفع للحساب الظاهر، ثم ارفع صورة الإيصال — يعتمده فريق المالية فيُشحن رصيدك وتُفعّل باقتك.</p>
      <BillingClient
        plans={plans}
        initialPlan={initialPlan}
        payableMethods={JSON.parse(JSON.stringify(payableMethods))}
        proofs={JSON.parse(JSON.stringify(myProofs))}
      />
    </div>
  );
}
