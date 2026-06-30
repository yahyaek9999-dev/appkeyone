import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import MetaControlUi from "./meta-control-ui";

export const dynamic = "force-dynamic";

export default async function AdminMetaPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">مركز إدارة Meta</h1>
        <p className="text-slate-400">
          تحكّم في اتصال Meta لكل عميل، امنح رصيدًا، راجع الاستهلاك والفواتير، واضبط الأسعار
          والحدود.
        </p>
      </div>
      <MetaControlUi />
    </div>
  );
}
