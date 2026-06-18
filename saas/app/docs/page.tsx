/**
 * /docs — PUBLIC documentation overview (Phase 10). No auth. Marketing-friendly;
 * exposes NO internal architecture or proprietary logic. Links to the gated
 * developer API docs for authenticated builders.
 */
import Link from "next/link";

export const dynamic = "force-dynamic";

const TOPICS: Array<{ title: string; desc: string }> = [
  { title: "Getting Started", desc: "Connect WhatsApp, train your assistant, add products, and go live." },
  { title: "Channels", desc: "Use WhatsApp via QR (Web) or the official Meta Cloud API." },
  { title: "Billing & Wallet", desc: "Prepaid wallet, top-ups via multiple methods, transparent per-conversation pricing." },
  { title: "Broadcasts", desc: "Plan-based campaigns and credit-funded campaigns with smart scheduling." },
  { title: "Developer API", desc: "REST API, keys, rate limits, webhooks, SDK snippets — for builders." },
  { title: "Integrations", desc: "Shopify, WooCommerce, and custom webhooks." },
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold mb-2">KEYONE — Documentation</h1>
        <p className="text-slate-400">Everything you need to launch and grow on WhatsApp.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {TOPICS.map((t) => (
          <div key={t.title} className="card p-5">
            <h2 className="font-bold mb-1">{t.title}</h2>
            <p className="text-sm text-slate-400">{t.desc}</p>
          </div>
        ))}
      </div>
      <div className="text-center text-sm text-slate-400">
        Building an integration? See the in-app <Link href="/dashboard/developer/docs" className="text-brand-300 underline">Developer API Docs</Link> and <Link href="/dashboard/developer/sdk" className="text-brand-300 underline">SDK generator</Link>.
      </div>
    </div>
  );
}
