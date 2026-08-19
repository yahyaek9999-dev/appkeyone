// /admin/copilot — Admin AI Copilot. Answers strictly from a real data snapshot;
// never mutates anything; shows the evidence used. Sensitive actions are never
// executed here — the Copilot can only recommend reviewing a page.
import CopilotChat from "./copilot-chat";

export const dynamic = "force-dynamic";

export default function AdminCopilotPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title mb-1">مساعد الإدارة الذكي</h1>
        <p className="page-desc">
          اسأل عن حالة المنصّة — يجيب من بيانات النظام الفعلية فقط، مع ذكر المصادر. لا ينفّذ أي إجراء حسّاس، ويقول
          «البيانات غير كافية» عند عدم توفّرها.
        </p>
      </div>
      <CopilotChat />
    </div>
  );
}
