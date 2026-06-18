/** /admin/internal-kb — internal staff knowledge base (Phase 5). Issue taxonomy. */
import { listIssues } from "@/lib/incidents/engine";

export const dynamic = "force-dynamic";

export default async function InternalKbPage() {
  const issues = await listIssues();
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">قاعدة المعرفة الداخلية (Staff KB)</h1>
      <p className="page-desc">لكل نوع مشكلة: المشكلة، السبب، الحل، القسم المسؤول. للطاقم فقط.</p>
      <div className="grid md:grid-cols-2 gap-4">
        {issues.map((i: any) => (
          <div key={i.key} className="card p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-full bg-brand-500/15 text-brand-300 text-[10px] px-2 py-0.5 font-mono">{i.category}</span>
              <h2 className="font-bold">{i.title}</h2>
            </div>
            <dl className="text-sm space-y-1">
              <div><dt className="inline text-slate-400">المشكلة: </dt><dd className="inline">{i.problem}</dd></div>
              <div><dt className="inline text-slate-400">السبب: </dt><dd className="inline">{i.cause}</dd></div>
              <div><dt className="inline text-emerald-300">الحل: </dt><dd className="inline">{i.resolution}</dd></div>
              <div><dt className="inline text-slate-400">القسم: </dt><dd className="inline font-mono text-xs">{i.department}</dd></div>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
