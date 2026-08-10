import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import KnowledgeUI from "./knowledge-ui";

export default async function KnowledgePage() {
  const user = await requireUser();
  const g = await pageGate("knowledge_base");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="مركز المعرفة"
          description="أضف منتجاتك وأسعارك وسياساتك لتحسين دقة الردود التلقائية. متاحة في باقة Pro فأعلى."
        />
      </div>
    );
  }
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
      <h1 className="page-title mb-1">مركز المعرفة</h1>
      <p className="page-desc mb-6">
        أضف منتجاتك وأسعارك وسياساتك وأسئلتك الشائعة — تُستخدم كمصدر رئيسي للردود التلقائية.
      </p>
      <KnowledgeUI docs={JSON.parse(JSON.stringify(docs))} />
    </div>
  );
}
