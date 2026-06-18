"use client";
import { useState } from "react";

export default function SupportClient({ articles }: { articles: Array<{ category: string; q: string; a: string }> }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const filtered = term ? articles.filter((x) => (x.q + " " + x.a + " " + x.category).toLowerCase().includes(term)) : articles;
  const cats = Array.from(new Set(filtered.map((x) => x.category)));
  return (
    <div className="space-y-5">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في مركز المساعدة… (Billing, Wallet, QR, Brain, CRM, API, Memberships)" className="w-full bg-white/5 rounded-lg px-4 py-2.5 text-sm" />
      {cats.length === 0 ? <p className="text-slate-500 text-sm">لا نتائج.</p> : cats.map((c) => (
        <div key={c} className="card p-5">
          <h2 className="font-bold mb-3">{c}</h2>
          <div className="space-y-3">
            {filtered.filter((x) => x.category === c).map((x, i) => (
              <details key={i} className="text-sm">
                <summary className="cursor-pointer font-medium text-slate-200">{x.q}</summary>
                <p className="text-slate-400 mt-1">{x.a}</p>
              </details>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
