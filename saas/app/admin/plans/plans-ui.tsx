"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface PlanRow {
  slug: string;
  name: string;
  nameEn: string;
  priceUsd: number;
  monthlyMsgs: number;
  tier: "basic" | "pro" | "max" | "companies";
  aiRequestsMonthly: number;
  broadcastsMonthly: number;
  whatsappSessions: number;
  metaAccess: "none" | "limited" | "full";
  analyticsAccess: "basic" | "advanced";
  queuePriority: number;
  rateLimitPerMin: number;
  featureFlags: Record<string, any>;
}

const KNOWN_FLAGS = ["broadcasts", "knowledge_base", "follow_ups", "templates", "daily_report", "api_access", "custom_persona"];

export default function PlansUi({ initial }: { initial: PlanRow[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [rows, setRows] = useState<PlanRow[]>(initial);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function update(slug: string, patch: Partial<PlanRow>) {
    setRows(r => r.map(p => p.slug === slug ? { ...p, ...patch } : p));
  }

  function save(p: PlanRow) {
    setMsg(null);
    start(async () => {
      const r = await fetch("/api/admin/plans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: p.slug,
          tier: p.tier,
          monthlyMsgs: Number(p.monthlyMsgs) || 0,
          aiRequestsMonthly: Number(p.aiRequestsMonthly) || 0,
          broadcastsMonthly: Number(p.broadcastsMonthly) || 0,
          whatsappSessions: Number(p.whatsappSessions) || 1,
          metaAccess: p.metaAccess,
          analyticsAccess: p.analyticsAccess,
          queuePriority: Number(p.queuePriority) || 0,
          rateLimitPerMin: Number(p.rateLimitPerMin) || 60,
          featureFlags: p.featureFlags,
        }),
      });
      if (r.ok) {
        setMsg(`تم حفظ ${p.name} ✓`);
        setEditing(null);
        router.refresh();
      } else {
        const j = await r.json().catch(() => ({}));
        setMsg(`فشل: ${j.error || r.status}`);
      }
    });
  }

  async function seedDefaults() {
    setMsg(null);
    const r = await fetch("/api/admin/membership/seed-defaults", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `تم زرع القيم الافتراضية: ${j.updated} باقة` : `فشل: ${j.error || r.status}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={seedDefaults} className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-sm font-bold">
          ⚙️ زرع القيم الافتراضية لكل الباقات
        </button>
        {msg && <span className="text-sm text-slate-300">{msg}</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rows.map(p => (
          <div key={p.slug} className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-lg">{p.name}</div>
                <div className="text-xs text-slate-500">{p.slug} · {p.nameEn} · ${p.priceUsd}/mo</div>
              </div>
              <span className={`px-2 py-0.5 rounded text-[11px] ${
                p.tier === "companies" ? "bg-purple-500/20 text-purple-300" :
                p.tier === "max" ? "bg-brand-500/20 text-brand-300" :
                p.tier === "pro" ? "bg-emerald-500/20 text-emerald-300" :
                "bg-slate-500/20 text-slate-300"
              }`}>{p.tier}</span>
            </div>

            {editing === p.slug ? (
              <div className="space-y-2 text-xs">
                <Field label="Tier (basic|pro|max|companies)" value={p.tier} onChange={v => update(p.slug, { tier: v as any })} />
                <Field label="رسائل شهرياً (0=∞)" type="number" value={p.monthlyMsgs} onChange={v => update(p.slug, { monthlyMsgs: Number(v) })} />
                <Field label="AI شهرياً (0=∞)" type="number" value={p.aiRequestsMonthly} onChange={v => update(p.slug, { aiRequestsMonthly: Number(v) })} />
                <Field label="Broadcasts شهرياً (0=∞)" type="number" value={p.broadcastsMonthly} onChange={v => update(p.slug, { broadcastsMonthly: Number(v) })} />
                <Field label="WhatsApp Sessions" type="number" value={p.whatsappSessions} onChange={v => update(p.slug, { whatsappSessions: Number(v) })} />
                <Field label="Meta Access (none|limited|full)" value={p.metaAccess} onChange={v => update(p.slug, { metaAccess: v as any })} />
                <Field label="Analytics (basic|advanced)" value={p.analyticsAccess} onChange={v => update(p.slug, { analyticsAccess: v as any })} />
                <Field label="Queue Priority (0-100)" type="number" value={p.queuePriority} onChange={v => update(p.slug, { queuePriority: Number(v) })} />
                <Field label="Rate Limit / دقيقة" type="number" value={p.rateLimitPerMin} onChange={v => update(p.slug, { rateLimitPerMin: Number(v) })} />
                <div>
                  <div className="text-slate-400 mb-1">Feature flags</div>
                  <div className="flex flex-wrap gap-2">
                    {KNOWN_FLAGS.map(f => (
                      <label key={f} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!p.featureFlags[f]}
                          onChange={e => update(p.slug, { featureFlags: { ...p.featureFlags, [f]: e.target.checked } })}
                        />
                        <span>{f}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => save(p)} disabled={pending} className="px-3 py-1 rounded bg-brand-500 hover:bg-brand-400 font-bold disabled:opacity-50">حفظ</button>
                  <button onClick={() => setEditing(null)} className="px-3 py-1 rounded bg-white/5 hover:bg-white/10">إلغاء</button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-300 space-y-1">
                <Row k="رسائل/شهر" v={p.monthlyMsgs || "∞"} />
                <Row k="AI/شهر" v={p.aiRequestsMonthly || "∞"} />
                <Row k="Broadcasts/شهر" v={p.broadcastsMonthly || "∞"} />
                <Row k="WA Sessions" v={p.whatsappSessions} />
                <Row k="Meta" v={p.metaAccess} />
                <Row k="Analytics" v={p.analyticsAccess} />
                <Row k="Priority" v={p.queuePriority} />
                <Row k="Rate/min" v={p.rateLimitPerMin} />
                <div className="pt-2">
                  <span className="text-slate-400">Flags: </span>
                  {Object.entries(p.featureFlags).filter(([_, v]) => v).map(([k]) => (
                    <span key={k} className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] mx-0.5">{k}</span>
                  ))}
                </div>
                <button onClick={() => setEditing(p.slug)} className="mt-2 px-3 py-1 rounded bg-white/5 hover:bg-white/10 text-xs">تعديل</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: any; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <div className="text-slate-400 mb-1">{label}</div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 focus:outline-none focus:border-brand-500"
      />
    </label>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return (
    <div className="flex justify-between border-b border-white/5 py-1">
      <span className="text-slate-400">{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}
