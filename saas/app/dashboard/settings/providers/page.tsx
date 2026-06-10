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
      <div>
        <div className="text-xs text-slate-500 mb-1">الإعدادات</div>
        <h1 className="page-title">المزوّدون</h1>
        <p className="page-desc mt-1">اربط مفاتيحك الخاصة لكل خدمة. كل حساب معزول تماماً، والمفاتيح مشفّرة بالكامل، مع تبديل احتياطي تلقائي عند تعطّل أي مزوّد.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {PROVIDER_DOMAINS.map((domain) => {
          const Icon = ICONS[domain];
          const total = listProviders(domain).length;
          const configured = counts[domain] || 0;
          return (
            <Link key={domain} href={`/dashboard/settings/providers/${DOMAIN_SLUGS[domain]}`}
              className="card p-5 hover:border-brand-400/40 transition-colors group">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-brand-500/10 border border-brand-500/20 p-2.5 text-brand-300">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-100">{DOMAIN_LABELS[domain].ar}</span>
                    {configured > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-2 py-0.5">
                        <CheckCircle2 className="w-3 h-3" /> {configured} مفعّل
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-400 mt-1">{BLURB[domain]}</p>
                  <p className="text-[11px] text-slate-500 mt-2">{total} مزوّد متاح</p>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-600 group-hover:text-brand-300 transition-colors" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
