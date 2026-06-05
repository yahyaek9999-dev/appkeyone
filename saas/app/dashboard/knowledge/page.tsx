import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import KnowledgeUI from "./knowledge-ui";

export default async function KnowledgePage() {
  const user = await requireUser();
  const docs = await prisma.document.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      content: true,
      source: true,
      sourceUrl: true,
      hitCount: true,
      lastMatchedAt: true,
      createdAt: true,
    },
  });
  return (
    <div>
      <h1 className="page-title mb-1">مركز تدريب المساعد</h1>
      <p className="page-desc mb-6">
        أضف منتجاتك وأسعارك وسياساتك وأسئلتك الشائعة — البوت يستخدمها كمصدر رئيسي للإجابة.
      </p>
      <KnowledgeUI docs={JSON.parse(JSON.stringify(docs))} />
    </div>
  );
}
