import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import KnowledgeUI from "./knowledge-ui";

export default async function KnowledgePage() {
  const user = await requireUser();
  const docs = await prisma.document.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <h1 className="text-3xl font-extrabold mb-2">قاعدة المعرفة</h1>
      <p className="text-slate-400 mb-8">
        ارفع داتا شركتك (منتجات, أسعار, FAQ, سياسات). البوت هيستخدمها كمصدر رئيسي للرد.
      </p>
      <KnowledgeUI docs={JSON.parse(JSON.stringify(docs))} />
    </div>
  );
}
