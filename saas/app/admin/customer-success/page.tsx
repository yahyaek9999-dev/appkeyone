// /admin/customer-success — actionable Admin queue derived from real signals.
// Each item links to Tenant 360. Not a CRM — a "who to contact and why" list.
import Link from "next/link";
import { getCustomerSuccessQueue, csCategoryLabel, type CsCategory } from "@/lib/admin/customer-success";
import { ExternalLink, Phone, CreditCard, Clock, Sparkles, MoonStar } from "lucide-react";

export const dynamic = "force-dynamic";

const ICON: Record<CsCategory, React.ComponentType<{ className?: string }>> = {
  never_connected_wa: Phone,
  trial_expiring: Clock,
  sub_expiring: Clock,
  payment_failed: CreditCard,
  inactive: MoonStar,
  new_tenant: Sparkles,
};

const URGENCY: Record<string, string> = {
  high: "border-rose-500/25 bg-rose-500/[0.04]",
  medium: "border-amber-500/25 bg-amber-500/[0.03]",
  low: "border-white/[0.06] bg-white/[0.02]",
};

export default async function CustomerSuccessPage() {
  const { items, counts } = await getCustomerSuccessQueue({ take: 300 });

  const cats = Object.keys(counts) as CsCategory[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title mb-1">نجاح العملاء</h1>
        <p className="page-desc">قائمة إجراءات فعلية: من تحتاج التواصل معه، ولماذا، وما الخطوة التالية — {items.length} عنصر.</p>
      </div>

      {cats.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {cats.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[12px] text-slate-300">
              {csCategoryLabel(c)} <span className="font-bold text-white">{counts[c]}</span>
            </span>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {items.length === 0 && <div className="py-10 text-center text-[12px] text-slate-600">لا عناصر متابعة حالياً.</div>}
        {items.map((it, i) => {
          const Icon = ICON[it.category];
          return (
            <div key={`${it.userId}-${it.category}-${i}`} className={`flex items-center gap-3 rounded-xl border p-4 ${URGENCY[it.urgency]}`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-slate-300">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-400">{csCategoryLabel(it.category)}</span>
                  <span className="text-sm font-semibold text-white">{it.reason}</span>
                </div>
                <div className="mt-0.5 text-[12px] text-slate-500">
                  {it.name || it.email || it.userId}{it.data ? ` · ${it.data}` : ""} · {it.recommendedAction}
                </div>
              </div>
              <Link
                href={`/admin/tenants/${it.userId}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-white/[0.16] hover:bg-white/[0.08]"
              >
                عرض 360° <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
