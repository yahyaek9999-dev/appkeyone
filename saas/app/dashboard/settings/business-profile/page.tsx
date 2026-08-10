import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BusinessProfileForm } from "./business-profile-form";

export const dynamic = "force-dynamic";

export default async function BusinessProfileSettingsPage() {
  const { user } = await requirePagePermission("settings");
  const profile = await prisma.businessProfile.findUnique({ where: { userId: user.id } });

  const initial = {
    businessType: (profile as any)?.businessType ?? null,
    enabledModules: (profile as any)?.enabledModules ?? null,
  };

  return (
    <div>
      <h1 className="page-title mb-1">نوع النشاط والوحدات</h1>
      <p className="page-desc mb-8">
        اختر نوع نشاطك ليتكيّف النظام معه، وفعّل أو عطّل وحدات مساحة العمل حسب احتياجك.
      </p>
      <div className="card p-6 max-w-2xl">
        <BusinessProfileForm initial={initial} />
      </div>
    </div>
  );
}
