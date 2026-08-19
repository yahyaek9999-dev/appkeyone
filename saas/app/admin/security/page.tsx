// /admin/security — Security Center. Aggregates REAL signals (ProtectionLog,
// sensitive admin AuditLog actions, API error responses). Failed-login signals
// are not persisted in this app and are shown as unavailable — never fabricated.
import { getSecurityEvents } from "@/lib/admin/security";
import SecurityCenter from "./security-center";
import { PageHeader } from "../_ui/primitives";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  const initial = await getSecurityEvents({ pageSize: 50 });
  return (
    <div>
      <PageHeader
        eyebrow="التحقيق"
        title="مركز الأمان"
        subtitle="إشارات أمنية فعلية: سجلات الحماية (flood/spam/abuse/ban)، إجراءات المشرفين الحسّاسة، وأخطاء واجهة البرمجة."
      />
      {!initial.availability.failedLogins && (
        <p className="adm-note" style={{ marginBottom: 12 }}>
          ملاحظة: محاولات تسجيل الدخول الفاشلة غير مُخزّنة في التطبيق حالياً — لا تُعرض كإشارة (لا تُختلق).
        </p>
      )}
      <SecurityCenter initial={initial} />
    </div>
  );
}
