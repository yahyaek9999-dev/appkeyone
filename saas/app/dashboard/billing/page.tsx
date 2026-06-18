/** /dashboard/billing — customer chooses plan + payment method + submits proof (Phase 1/9). */
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listPaymentMethods } from "@/lib/payments-ops/methods";
import { listPaymentProofs } from "@/lib/payments-ops/proofs";
import { TIERS } from "@/lib/pricing/catalog";
import BillingClient from "./billing-client";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const [methods, myProofs, dbPlans] = await Promise.all([
    listPaymentMethods(),
    listPaymentProofs({ userId: uid, take: 10 }),
    prisma.plan.findMany({ select: { slug: true, priceUsd: true, status: true } }),
  ]);
  const dbBySlug = new Map(dbPlans.map((p) => [p.slug, p]));
  // Catalog is the canonical tier list; overlay the admin-editable DB price and
  // hide any plan the owner archived in /admin/plans. Seeded DB price == catalog
  // price and default status "active" → behavior is identical until an owner edits.
  const plans = TIERS.filter((t) => t.priceUsdMonthly != null)
    .filter((t) => ((dbBySlug.get(t.slug)?.status as string) ?? "active") !== "archived")
    .map((t) => ({ slug: t.slug, name: t.name.en, price: dbBySlug.get(t.slug)?.priceUsd ?? t.priceUsdMonthly }));
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
