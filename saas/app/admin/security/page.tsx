// /admin/security — Security Center. Aggregates REAL signals (ProtectionLog,
// sensitive admin AuditLog actions, API error responses). Failed-login signals
// are not persisted in this app and are shown as unavailable — never fabricated.
import { getSecurityEvents } from "@/lib/admin/security";
import SecurityCenter from "./security-center";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  const initial = await getSecurityEvents({ pageSize: 50 });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title mb-1">مركز الأمان</h1>
        <p className="page-desc">
          إشارات أمنية فعلية: سجلات الحماية (flood/spam/abuse/ban)، إجراءات المشرفين الحسّاسة، وأخطاء واجهة البرمجة.
        </p>
      </div>
      {!initial.availability.failedLogins && (
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] text-slate-400">
          ملاحظة: محاولات تسجيل الدخول الفاشلة غير مُخزّنة في التطبيق حالياً — لا تُعرض كإشارة (لا تُختلق).
        </div>
      )}
      <SecurityCenter initial={initial} />
    </div>
  );
}
