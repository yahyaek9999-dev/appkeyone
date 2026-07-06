import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import AdminIntegrationsForm from "./integrations-form";

export const dynamic = "force-dynamic";

export default async function AdminIntegrationsPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold mb-2">تكاملات المنصة</h1>
        <p className="text-slate-400">
          اضبط Meta والذكاء الاصطناعي من هنا بدون الحاجة لمتغيرات بيئة. المفاتيح محفوظة بتشفير كامل.
        </p>
      </div>
      <AdminIntegrationsForm />
    </div>
  );
}
