/**
 * /dashboard/plan — per-plan dashboard (Phase 5): widgets, limits, onboarding.
 *
 * This page used to print machine identifiers straight at the merchant: the
 * widget chips read `smart_assistant` / `knowledge_base` / `api_access` in a
 * monospace font, the limits table was keyed `messages` / `ai` / `whatsapp`,
 * and the subtitle said "باقة k_enterprise (companies)". Every one of those
 * keys already has an Arabic label in the pricing catalog — the page simply
 * never looked them up. Found by opening the page as a customer.
 */
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { getEffectivePlan } from "@/lib/membership/plan";
import { getPlanDashboard } from "@/lib/plans/dashboards";
import { CAPABILITIES } from "@/lib/pricing/catalog";

export const dynamic = "force-dynamic";

/**
 * Widget key → Arabic. Most widget keys ARE capability keys, so the catalog is
 * the source. Two are not: getPlanDashboard() always prepends "customers" and
 * "orders", which the catalog spells `customer_management` / `order_management`.
 * They are named here rather than aliased into the catalog, because the catalog
 * is the price list and must not grow entries that nothing sells.
 */
const CAP_AR: Record<string, string> = {
  ...Object.fromEntries(CAPABILITIES.map((c) => [c.key, c.label.ar])),
  customers: "العملاء",
  orders: "الطلبات",
};

/**
 * Limit keys are not capabilities, so they have no catalog entry. They are a
 * closed set of six, defined alongside TierLimits.
 */
const LIMIT_AR: Record<string, string> = {
  messages: "الرسائل شهريًا",
  ai: "طلبات الذكاء الاصطناعي شهريًا",
  broadcasts: "حملات البثّ شهريًا",
  customers: "عدد العملاء",
  whatsapp: "أرقام واتساب",
  team: "أعضاء الفريق",
};

export default async function PlanDashboardPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const plan = await getEffectivePlan(uid);
  const d = getPlanDashboard(plan.slug);
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">لوحة باقتك — {d.name}</h1>
      <p className="page-desc">هذه عناصر باقتك وحدودها وخطوات تهيئتها.</p>

      <div className="card p-5">
        <h2 className="font-bold mb-3">العناصر المتاحة</h2>
        <div className="flex flex-wrap gap-2">
          {d.widgets.map((w) => (
            // Falls back to the raw key rather than rendering an empty chip, so
            // a capability added to a plan before the catalog can never vanish
            // silently from the customer's own plan page.
            <span key={w} className="rounded-full bg-brand-500/15 text-brand-300 text-xs px-3 py-1">
              {CAP_AR[w] ?? w}
            </span>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-bold mb-3">الحدود</h2>
          <table className="w-full text-sm"><tbody>
            {Object.entries(d.limits).map(([k, v]) => (
              <tr key={k} className="border-t border-white/5">
                <td className="p-1.5 text-slate-300">{LIMIT_AR[k] ?? k}</td>
                <td className="p-1.5 text-left font-bold">{v === 0 ? "بلا حدود" : v.toLocaleString("ar-EG")}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
        <div className="card p-5">
          <h2 className="font-bold mb-3">خطوات التهيئة</h2>
          <ol className="list-decimal list-inside space-y-1 text-sm text-slate-300">
            {d.onboarding.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
      </div>
    </div>
  );
}
