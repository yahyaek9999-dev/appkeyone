import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import AiControlUi from "./ai-control-ui";

export const dynamic = "force-dynamic";

export default async function AiControlPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">مركز التحكم بالذكاء الاصطناعي</h1>
        <p className="text-slate-400">
          صحة المزوّدين، استهلاك التوكنات، التكلفة، وعقل المعرفة وجودة الردود — بيانات حقيقية محدّثة
          لحظياً.
        </p>
      </div>
      <AiControlUi />
    </div>
  );
}
