import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { can } from "@/lib/rbac";
import TestingArenaClient from "./testing-arena-client";

export const dynamic = "force-dynamic";

export default async function TestingArenaPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "settings")) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">ساحة الاختبار</h1>
        <p className="page-desc">
          فحص حقيقي لجاهزية متجرك والمساعد. يختبر ردّ البوت على ٥ سيناريوهات حقيقية،
          يقيّم كل ردّ، ويكشف نقاط الضعف ويقترح الحلول — بدون بيانات وهمية.
        </p>
      </div>
      <TestingArenaClient />
    </div>
  );
}
