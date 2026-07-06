/**
 * /dashboard/developer/sdk — SDK snippet generator (Phase 8). Plan-gated api_access.
 * Generates ready-to-paste cURL / JavaScript / Python clients for the public API.
 */
import { redirect } from "next/navigation";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import { Code2 } from "lucide-react";

export const dynamic = "force-dynamic";

const CURL = `curl https://<your-keyone-domain>/api/v1/customers?limit=50 \\
  -H "Authorization: Bearer ko_live_xxxxxxxxxxxxxxxxxxxx"`;

const JS = `const KEYONE = (apiKey, base = "https://<your-keyone-domain>") => ({
  async me() {
    const r = await fetch(base + "/api/v1/me", { headers: { Authorization: "Bearer " + apiKey } });
    return r.json();
  },
  async customers(limit = 50, cursor) {
    const q = new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) });
    const r = await fetch(base + "/api/v1/customers?" + q, { headers: { Authorization: "Bearer " + apiKey } });
    return r.json();
  },
});
// const api = KEYONE("ko_live_..."); await api.customers(50);`;

const PY = `import requests
class Keyone:
    def __init__(self, api_key, base="https://<your-keyone-domain>"):
        self.h = {"Authorization": f"Bearer {api_key}"}; self.base = base
    def me(self):
        return requests.get(f"{self.base}/api/v1/me", headers=self.h).json()
    def customers(self, limit=50, cursor=None):
        p = {"limit": limit} | ({"cursor": cursor} if cursor else {})
        return requests.get(f"{self.base}/api/v1/customers", headers=self.h, params=p).json()
# Keyone("ko_live_...").customers(50)`;

export default async function SdkPage() {
  const g = await pageGate("api_access");
  if (!g.uid) redirect("/login");
  if (!g.allowed) {
    return <div className="p-6"><LockedFeature title="مولّد SDK" description="مكتبات جاهزة (cURL / JavaScript / Python) لواجهة KEYONE. متاح ضمن باقات الأعمال الأعلى." recommendedTier={g.recommendedTier} /></div>;
  }
  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="page-title mb-1 flex items-center gap-2"><Code2 className="h-6 w-6 text-brand-300" /> مولّد SDK</h1>
      <p className="page-desc">مكتبات عميل جاهزة للصق لواجهة KEYONE العامة (/api/v1). استبدل المفتاح والنطاق.</p>
      <Snippet title="cURL" code={CURL} />
      <Snippet title="JavaScript (fetch)" code={JS} />
      <Snippet title="Python (requests)" code={PY} />
    </div>
  );
}
function Snippet({ title, code }: { title: string; code: string }) {
  return (
    <div className="card p-5">
      <h2 className="font-bold mb-2">{title}</h2>
      <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 text-xs font-mono text-slate-200 whitespace-pre" dir="ltr">{code}</pre>
    </div>
  );
}
