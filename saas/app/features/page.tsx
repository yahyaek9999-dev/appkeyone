/**
 * /features — PUBLIC marketing capabilities page (Phase 10). No auth.
 * Marketing-friendly only — exposes NO internal architecture or Brain internals.
 */
export const dynamic = "force-dynamic";

const SECTIONS: Array<{ title: string; items: string[] }> = [
  { title: "Channels", items: ["WhatsApp (QR Web)", "WhatsApp Cloud API (Meta)"] },
  { title: "Platforms", items: ["Web Dashboard", "Mobile-friendly", "Developer REST API"] },
  { title: "Integrations", items: ["Shopify", "WooCommerce", "Custom Webhooks", "REST API v1"] },
  { title: "AI Providers", items: ["OpenAI", "Anthropic", "Gemini", "OpenRouter", "Groq", "Bring-Your-Own-Key"] },
  { title: "Languages", items: ["Arabic (MSA)", "Egyptian / Gulf / Levantine / Maghrebi dialects", "English"] },
  { title: "Industries", items: ["Furniture", "Cars", "Clinics", "Real Estate", "Restaurants", "E-commerce"] },
  { title: "Business", items: ["Smart Auto-Reply", "CRM & Lead Scoring", "Orders", "Broadcast Campaigns", "Prepaid Wallet Billing", "Analytics & Reports"] },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold mb-2">KEYONE — Features</h1>
        <p className="text-slate-400">Sell on WhatsApp, professionally — AI replies, CRM, billing, and analytics in one platform.</p>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SECTIONS.map((s) => (
          <div key={s.title} className="card p-5">
            <h2 className="font-bold mb-3">{s.title}</h2>
            <ul className="space-y-1.5 text-sm text-slate-300">
              {s.items.map((it) => <li key={it} className="flex items-center gap-2"><span className="text-brand-300">✓</span>{it}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
