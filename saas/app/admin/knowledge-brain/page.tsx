import { prisma } from "@/lib/db";
import KnowledgeBrainAdminUi from "./knowledge-brain-admin-ui";

export const dynamic = "force-dynamic";

// Admin control surface for the Knowledge Brain feature flag.
// Auth is enforced by app/admin/layout.tsx (owner + role === "admin").
// Initial tenant list is rendered server-side; toggles persist via
// POST /api/admin/knowledge-brain.

export default async function AdminKnowledgeBrainPage() {
  const users = await prisma.user.findMany({
    where: { role: "user" } as any,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { documents: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">العقل المعرفي — التحكم</h1>
        <p className="page-desc">
          تفعيل أو إيقاف ميزة العقل المعرفي لكل تاجر، ومتابعة عدد المستندات المرفوعة.
        </p>
      </div>

      <KnowledgeBrainAdminUi
        initialUsers={users.map((u: any) => ({
          id: u.id,
          email: u.email,
          name: u.name ?? null,
          knowledgeBrainEnabled: (u as any).knowledgeBrainEnabled ?? false,
          docCount: u._count.documents,
        }))}
      />
    </div>
  );
}
