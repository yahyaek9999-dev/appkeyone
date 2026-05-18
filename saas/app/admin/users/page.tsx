import { prisma } from "@/lib/db";
import UsersUi from "./users-ui";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const [users, plans] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: { subscription: { include: { plan: true } } },
    }),
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">العملاء والاشتراكات</h1>
        <p className="text-slate-400">إدارة كاملة لاشتراكات العملاء.</p>
      </div>
      <UsersUi
        users={users.map((u: any) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          phone: u.phone,
          role: u.role,
          createdAt: u.createdAt.toISOString(),
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
