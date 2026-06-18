/** /admin/reports — Executive Reporting (Phase 11): daily/weekly/monthly. */
import { getAllReports } from "@/lib/admin/reports";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const r = await getAllReports();
  const cards = [
    { title: "يومي (Daily)", d: r.daily },
    { title: "أسبوعي (Weekly)", d: r.weekly },
    { title: "شهري (Monthly)", d: r.monthly },
  ];
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">التقارير التنفيذية (Executive Reports)</h1>
      <p className="page-desc">الإيراد، الربح، استهلاك الدماغ وMeta والمحفظة، ونمو العملاء.</p>
      <div className="grid md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.title} className="card p-5">
            <h2 className="font-bold mb-3">{c.title}</h2>
            <table className="w-full text-sm"><tbody>
              <Row k="الإيراد ($)" v={c.d.revenue} />
              <Row k="الربح ($)" v={c.d.profit} />
              <Row k="Meta usage ($)" v={c.d.metaUsage} />
              <Row k="Meta cost ($)" v={c.d.metaCost} />
              <Row k="Wallet usage ($)" v={c.d.walletUsage} />
              <Row k="Brain usage" v={c.d.brainUsage} />
              <Row k="نمو العملاء" v={c.d.customerGrowth} />
              <Row k="الطلبات" v={c.d.orders} />
            </tbody></table>
          </div>
        ))}
      </div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: number }) {
  return <tr className="border-t border-white/5"><td className="p-1.5 text-slate-300">{k}</td><td className="p-1.5 text-left font-bold">{v.toLocaleString()}</td></tr>;
}
