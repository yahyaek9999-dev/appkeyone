/** /admin/memberships — full plan comparison matrix (Phase 7). */
import { getMembershipMatrix } from "@/lib/memberships/matrix";

export const dynamic = "force-dynamic";

export default function MembershipsPage() {
  const rows = getMembershipMatrix();
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">مصفوفة الباقات (Memberships)</h1>
      <p className="page-desc">المقارنة الدقيقة: المزايا، الكريدت، رصيد الدماغ، رصيد الحملات، API، QR، مستوى الدعم.</p>
      <div className="card p-5 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead><tr className="text-slate-400 text-xs">
            <th className="p-1.5 text-right">الباقة</th><th className="p-1.5">السعر</th><th className="p-1.5">رسائل</th><th className="p-1.5">AI</th><th className="p-1.5">بثّ</th><th className="p-1.5">عملاء</th><th className="p-1.5">WA</th><th className="p-1.5">فريق</th><th className="p-1.5">Brain cr.</th><th className="p-1.5">Bcast cr.</th><th className="p-1.5">API</th><th className="p-1.5">QR</th><th className="p-1.5">الدعم</th>
          </tr></thead>
          <tbody>
            <tr className="border-t border-white/5 text-slate-400"><td className="p-1.5 font-semibold">Free</td><td className="p-1.5 text-center">$0</td><td className="p-1.5 text-center">100</td><td className="p-1.5 text-center">100</td><td className="p-1.5 text-center">0</td><td className="p-1.5 text-center">∞</td><td className="p-1.5 text-center">1</td><td className="p-1.5 text-center">1</td><td className="p-1.5 text-center">0</td><td className="p-1.5 text-center">0</td><td className="p-1.5 text-center">✗</td><td className="p-1.5 text-center">✗</td><td className="p-1.5 text-center">standard</td></tr>
            {rows.map((r) => (
              <tr key={r.slug} className="border-t border-white/5">
                <td className="p-1.5 font-semibold">{r.name}</td>
                <td className="p-1.5 text-center">{r.price == null ? "—" : "$" + r.price}</td>
                <td className="p-1.5 text-center">{r.messages === 0 ? "∞" : r.messages.toLocaleString()}</td>
                <td className="p-1.5 text-center">{r.ai === 0 ? "∞" : r.ai.toLocaleString()}</td>
                <td className="p-1.5 text-center">{r.broadcasts === 0 ? "∞" : r.broadcasts}</td>
                <td className="p-1.5 text-center">{r.customers === 0 ? "∞" : r.customers.toLocaleString()}</td>
                <td className="p-1.5 text-center">{r.whatsapp === 0 ? "∞" : r.whatsapp}</td>
                <td className="p-1.5 text-center">{r.team === 0 ? "∞" : r.team}</td>
                <td className="p-1.5 text-center">{r.brainCredits.toLocaleString()}</td>
                <td className="p-1.5 text-center">{r.broadcastCredits.toLocaleString()}</td>
                <td className="p-1.5 text-center">{r.apiAccess ? "✓" : "✗"}</td>
                <td className="p-1.5 text-center">{r.qrAccess ? "✓" : "✗"}</td>
                <td className="p-1.5 text-center">{r.support}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
