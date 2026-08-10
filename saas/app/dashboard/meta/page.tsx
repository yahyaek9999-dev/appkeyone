import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import MetaCenterUi from "./meta-center-ui";

export const dynamic = "force-dynamic";

export default async function CustomerMetaPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">مركز Meta والفوترة</h1>
        <p className="text-sm text-slate-400 max-w-xl">
          حالة اتصالك بواتساب الرسمي (Meta)، استهلاك المحادثات وتكلفتها، رصيدك، وفواتيرك الشهرية —
          كل شيء في مكان واحد.
        </p>
      </div>
      <MetaCenterUi />
    </div>
  );
}
