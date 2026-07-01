/**
 * Developer Center — API keys, usage metrics, rate limits, and API/webhook docs.
 *
 * Owner-only + plan-gated on the "api_access" capability (k_scale+). When the
 * plan does not include API access we render the standard <LockedFeature>
 * upsell instead of the tools. All key/usage data is real, served by
 * /api/developer/* (which re-checks the same gate).
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import { Code2, BookOpen } from "lucide-react";
import DeveloperClient from "./developer-client";

export const dynamic = "force-dynamic";

export default async function DeveloperPage() {
  const g = await pageGate("api_access");
  if (!g.uid) redirect("/login");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1 flex items-center gap-2">
            <Code2 className="h-6 w-6 text-brand-300" /> مركز المطوّرين
          </h1>
          <p className="page-desc">
            مفاتيح API، مراقبة الاستخدام، حدود المعدّل، وتوثيق الواجهات البرمجية والويب هوك — لبناء تكاملاتك الخاصة فوق KEYONE.
          </p>
        </div>
        {g.allowed ? (
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/developer/docs" className="btn-secondary inline-flex items-center gap-2 text-sm whitespace-nowrap">
              <BookOpen className="h-4 w-4" /> مركز التوثيق الكامل
            </Link>
            <Link href="/dashboard/developer/sdk" className="btn-secondary inline-flex items-center gap-2 text-sm whitespace-nowrap">
              <Code2 className="h-4 w-4" /> مكتبات SDK
            </Link>
          </div>
        ) : null}
      </div>

      {!g.allowed ? (
        <LockedFeature
          title="وصول API للمطوّرين"
          description="أنشئ مفاتيح API آمنة، وراقب الاستخدام، واربط أنظمتك مباشرة بـ KEYONE عبر واجهات REST. متاح ضمن باقات الأعمال الأعلى."
          recommendedTier={g.recommendedTier}
        />
      ) : (
        <DeveloperClient />
      )}
    </div>
  );
}
