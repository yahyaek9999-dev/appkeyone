import UpgradeRequestsUi from "./upgrade-requests-ui";

export const dynamic = "force-dynamic";

export default function AdminUpgradeRequestsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold">طلبات الترقية</h1>
        <p className="text-slate-400">فعّل أو ارفض طلبات ترقية الباقات. التفعيل يضبط اشتراك العميل على الباقة المطلوبة فوراً.</p>
      </div>
      <UpgradeRequestsUi />
    </div>
  );
}
