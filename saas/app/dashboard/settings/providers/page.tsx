import Link from "next/link";
import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PROVIDER_DOMAINS, type ProviderDomain } from "@/lib/integrations/types";
import { DOMAIN_LABELS, DOMAIN_SLUGS, listProviders } from "@/lib/integrations/registry";
import { Brain, Mic, Image as ImageIcon, MessageSquare, Mail, ChevronLeft, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

const ICONS: Record<ProviderDomain, any> = {
  ai: Brain, speech: Mic, image: ImageIcon, sms: MessageSquare, email: Mail,
};
const BLURB: Record<ProviderDomain, string> = {
  ai: "ربط مزوّدك الخاص + تبديل احتياطي تلقائي.",
  speech: "تفريغ الرسائل الصوتية بالعربية ولغات أخرى.",
  image: "توليد وتحليل الصور (إيصالات، منتجات، تسويق).",
  sms: "إرسال SMS مع تتبّع التسليم وإعادة المحاولة.",
  email: "بريد المعاملات والحملات مع تبديل احتياطي.",
};

export default async function ProvidersHubPage() {
  const { user } = await requirePagePermission("settings");

  const rows = (await (prisma as any).tenantProviderCredential
    .groupBy({ by: ["domain"], where: { userId: user.id }, _count: { _all: true } })
    .catch(() => [])) as { domain: string; _count: { _all: number } }[];
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.domain] = r._count._all;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="border-b border-white/[0.05] pb-5">
        <h1 className="page-title">المزوّدون</h1>
        <p className="page-desc mt-2">اربط مفاتيحك الخاصة لكل خدمة — المفاتيح مشفّرة وكل حساب معزول تماماً.</p>
      </div>

      {/* Evidence (Phase 11, screenshots 61 & 71): five identical cards, each
          with the same emerald icon tile, in a 2-column grid that left the last
          one orphaned mid-row. Configured and unconfigured domains looked
          exactly alike, so the one thing a merchant comes here to check —
          "what have I actually connected?" — was invisible. Now one surface,
          and connection STATUS is the column that reads first. */}
      <div className="overflow-hidden rounded-xl border border-white/[0.07]">
        <ul className="divide-y divide-white/[0.04]">
          {PROVIDER_DOMAINS.map((domain) => {
            const Icon = ICONS[domain];
            const total = listProviders(domain).length;
            const configured = counts[domain] || 0;
            return (
              <li key={domain}>
                <Link
                  href={`/dashboard/settings/providers/${DOMAIN_SLUGS[domain]}`}
                  className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/50 focus-visible:ring-inset"
                >
                  <Icon className={`h-4 w-4 shrink-0 transition-colors ${configured > 0 ? "text-brand-300" : "text-slate-600"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-slate-100 transition-colors group-hover:text-brand-300">
                      {DOMAIN_LABELS[domain].ar}
                    </div>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500">{BLURB[domain]}</p>
                  </div>
                  <div className="hidden shrink-0 text-end sm:block">
                    {configured > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {configured} مفعّل
                      </span>
                    ) : (
                      <span className="text-[12px] text-slate-600">غير مربوط</span>
                    )}
                    <div className="mt-0.5 text-[11px] text-slate-600">{total} مزوّد متاح</div>
                  </div>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-slate-600 transition-transform group-hover:-translate-x-0.5 group-hover:text-slate-400" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
