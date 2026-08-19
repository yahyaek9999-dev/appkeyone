// /admin/copilot — Admin AI Copilot. Answers strictly from a real data snapshot;
// never mutates anything; shows the evidence used. Sensitive actions are never
// executed here — the Copilot can only recommend reviewing a page.
import CopilotChat from "./copilot-chat";
import { PageHeader } from "../_ui/primitives";

export const dynamic = "force-dynamic";

export default function AdminCopilotPage() {
  return (
    <div>
      <PageHeader
        eyebrow="ذكاء التشغيل"
        title="مساعد الإدارة"
        subtitle="اسأل عن حالة المنصّة — يجيب من بيانات النظام الفعلية فقط مع ذكر المصادر. لا ينفّذ أي إجراء حسّاس، ويقول «البيانات غير كافية» عند عدم توفّرها."
      />
      <CopilotChat />
    </div>
  );
}
