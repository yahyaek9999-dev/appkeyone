/** /admin/white-label — White-label configs across tenants (Phase 7). */
import { listWhiteLabelConfigs } from "@/lib/whitelabel/resolve";

export const dynamic = "force-dynamic";

export default async function AdminWhiteLabelPage() {
  const cfgs = await listWhiteLabelConfigs();
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">العلامة البيضاء (White Label)</h1>
      <p className="page-desc">إعدادات العلامة البيضاء عبر المستأجرين — الاسم، الألوان، الشعار، النطاق المخصّص.</p>
      <div className="card p-5 overflow-x-auto">
        {cfgs.length === 0 ? <p className="text-slate-500 text-sm">لا توجد إعدادات علامة بيضاء بعد.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-slate-400 text-xs"><th className="p-1.5 text-right">العلامة</th><th className="p-1.5 text-right">مفعّلة</th><th className="p-1.5 text-right">الألوان</th><th className="p-1.5 text-right">النطاق</th><th className="p-1.5 text-right">إخفاء KEYONE</th></tr></thead>
            <tbody>
              {cfgs.map((c: any) => (
                <tr key={c.id} className="border-t border-white/5">
                  <td className="p-1.5 font-semibold">{c.brandName || "—"}</td>
                  <td className="p-1.5">{c.enabled ? "✓" : "✗"}</td>
                  <td className="p-1.5"><span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: c.primaryColor || "#666" }} /><span className="inline-block w-3 h-3 rounded" style={{ background: c.accentColor || "#999" }} /></span></td>
                  <td className="p-1.5 font-mono text-xs text-slate-400">{c.customDomain || "—"}</td>
                  <td className="p-1.5">{c.hideKeyone ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-slate-500 text-xs">الإدارة الذاتية للعلامة من <code className="font-mono">/dashboard/white-label</code> عبر <code className="font-mono">/api/white-label</code>.</p>
    </div>
  );
}
