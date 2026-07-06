import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import EmbeddingsUi from "./embeddings-ui";

export const dynamic = "force-dynamic";

export default async function AdminEmbeddingsPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">مركز التضمين (Embeddings)</h1>
        <p className="text-slate-400">
          إدارة مزوّدي التضمين، الأولوية والتجاوز عند الفشل، فحص الاتصال، والإحصاءات. المزوّد المحلي
          يعمل بدون مفتاح؛ OpenAI/Gemini يحتاجان مفتاحاً.
        </p>
      </div>
      <EmbeddingsUi />
    </div>
  );
}
