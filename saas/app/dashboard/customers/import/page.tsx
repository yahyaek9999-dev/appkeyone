import { requirePagePermission } from "@/lib/auth";
import ImportUi from "./import-ui";

export const dynamic = "force-dynamic";

export default async function CustomerImportPage() {
  await requirePagePermission("customers");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">استيراد العملاء</h1>
        <p className="page-desc">
          الصق أرقام عملائك أو ارفع ملف CSV — نتحقق من الأرقام ونضيف الجدد فقط (بدون تكرار).
        </p>
      </div>
      <ImportUi />
    </div>
  );
}
