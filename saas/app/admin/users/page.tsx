import { prisma } from "@/lib/db";
import UsersUi from "./users-ui";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const [users, plans] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: { subscription: { include: { plan: true } } },
    }),
    // Only CURRENT plans are assignable — archived/legacy plans must never be
    // offered when activating or changing a customer's subscription.
    prisma.plan.findMany({ where: { status: { not: "archived" } }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">العملاء والاشتراكات</h1>
        <p className="page-desc">إدارة كاملة لاشتراكات العملاء.</p>
      </div>
      <UsersUi
        users={users.map((u: any) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          phone: u.phone,
          role: u.role,
          createdAt: u.createdAt.toISOString(),
          approvalStatus: u.approvalStatus ?? "approved",
          suspended: u.suspended ?? false,
          suspendedReason: u.suspendedReason ?? null,
          subscription: u.subscription
            ? {
                status: u.subscription.status,
                planSlug: u.subscription.plan.slug,
                planName: u.subscription.plan.name,
                expiresAt: u.subscription.expiresAt.toISOString(),
                msgsUsed: u.subscription.msgsUsed,
                monthlyMsgs: u.subscription.plan.monthlyMsgs,
                billingCycle: u.subscription.billingCycle,
                paymentRef: u.subscription.paymentRef,
              }
            : null,
        }))}
        plans={plans.map((p: any) => ({
          slug: p.slug,
          name: p.name,
          priceUsd: p.priceUsd,
          yearlyUsd: p.yearlyUsd,
          monthlyMsgs: p.monthlyMsgs,
        }))}
      />
    </div>
  );
}
