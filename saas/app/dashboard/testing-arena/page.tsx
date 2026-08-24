import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import TestingArenaClient from "./testing-arena-client";

export const dynamic = "force-dynamic";

// Internal testing/diagnostic surface: listed only in ADMIN_WORKSPACE and it
// carries no upsell path, so it was never wired to be sold. Platform-admin only.
export default async function TestingArenaPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-white/[0.05] pb-5">
        <h1 className="page-title">ساحة الاختبار</h1>
        <p className="page-desc mt-1">
          فحص حقيقي لجاهزية نظام الردود التلقائية. يختبر ٥ سيناريوهات حقيقية،
          يقيّم كل رد، ويكشف نقاط الضعف ويقترح الحلول — بدون بيانات وهمية.
        </p>
      </div>
      <TestingArenaClient />
    </div>
  );
}
