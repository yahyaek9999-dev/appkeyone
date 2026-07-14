"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CAPABILITIES } from "@/lib/pricing/catalog";

interface PlanRow {
  slug: string;
  name: string;
  nameEn: string;
  description: string;
  priceUsd: number;
  yearlyUsd: number | null;
  status: "active" | "archived";
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

// Boolean capability flags from the pricing catalog + legacy flags that
// predate it. Numeric soft-limits (team/automations/kbDocs) are intentionally
// excluded — they're not booleans and are managed via the seed/catalog.
const KNOWN_FLAGS = Array.from(
  new Set([
    ...CAPABILITIES.map((c) => c.key),
    "follow_ups",
    "templates",
    "daily_report",
    "custom_persona",
  ]),
);

interface PriceDrift {
  slug: string;
  catalogPrice: number;
  dbPrice: number;
}

export default function PlansUi({
  initial,
  missingFromDb = [],
  priceDrift = [],
}: {
  initial: PlanRow[];
  missingFromDb?: string[];
  priceDrift?: PriceDrift[];
}) {
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
          name: p.name,
          nameEn: p.nameEn,
          description: p.description || "",
          priceUsd: Number(p.priceUsd) || 0,
          yearlyUsd: p.yearlyUsd == null || p.yearlyUsd === ("" as any) ? null : Number(p.yearlyUsd),
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

  function toggleArchive(p: PlanRow) {
    const next = p.status === "archived" ? "active" : "archived";
    if (next === "archived" && !confirm(`أرشفة باقة "${p.name}"؟\nستختفي من صفحة الأسعار وشاشة الدفع للعملاء الجدد. المشتركون الحاليون يحتفظون بباقتهم ومزاياها.`)) return;
    setMsg(null);
    start(async () => {
      const r = await fetch("/api/admin/plans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: p.slug, status: next }),
      });
      if (r.ok) {
        update(p.slug, { status: next });
        setMsg(next === "archived" ? `تمت أرشفة ${p.name} ✓` : `تمت استعادة ${p.name} ✓`);
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

  async function seedCatalog() {
    setMsg(null);
    const r = await fetch("/api/admin/plans/seed-catalog", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setMsg(
      r.ok
        ? j.created.length
          ? `تم إنشاء ${j.created.length} باقة جديدة من الكتالوج: ${j.created.join(", ")}`
          : "كل باقات الكتالوج موجودة بالفعل — لم يتغيّر شيء"
        : `فشل: ${j.error || r.status}`,
    );
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {(missingFromDb.length > 0 || priceDrift.length > 0) && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm space-y-1.5">
          <div className="font-bold text-amber-300">⚠️ فرق بين الكتالوج (catalog.ts) وقاعدة البيانات</div>
          {missingFromDb.length > 0 && (
            <div className="text-amber-200/90">
              باقات موجودة في الكتالوج ومش موجودة في القاعدة: <span className="font-mono">{missingFromDb.join(", ")}</span> — استخدم زر "زرع باقات الكتالوج المفقودة" تحت.
            </div>
          )}
          {priceDrift.length > 0 && (
            <div className="text-amber-200/90">
              باقات سعرها في القاعدة مختلف عن الكتالوج (ممكن يكون تعديل سعر متعمد من الأدمن — لسه محدش هيغيّره تلقائي):
              <ul className="mt-1 list-inside list-disc">
                {priceDrift.map((d) => (
                  <li key={d.slug} className="font-mono">
                    {d.slug}: كتالوج ${d.catalogPrice} ≠ قاعدة البيانات ${d.dbPrice}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={seedDefaults} className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-sm font-bold">
          ⚙️ زرع القيم الافتراضية لكل الباقات
        </button>
        <button
          onClick={seedCatalog}
          className="px-4 py-2 rounded-lg bg-brand-500/20 text-brand-300 hover:bg-brand-500/30 text-sm font-bold"
          title="ينشئ فقط الباقات المفقودة من الكتالوج — لا يغيّر أي باقة موجودة أو تم تعديل سعرها"
        >
          🧩 زرع باقات الكتالوج المفقودة
        </button>
        {msg && <span className="text-sm text-slate-300">{msg}</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rows.map(p => (
          <div key={p.slug} className={`card p-5 space-y-3 ${p.status === "archived" ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-lg flex items-center gap-2">
                  {p.name}
                  {p.status === "archived" && <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px]">مؤرشفة</span>}
                </div>
                <div className="text-xs text-slate-500">{p.slug} · {p.nameEn} · ${p.priceUsd}/mo{p.yearlyUsd ? ` · $${p.yearlyUsd}/yr` : ""}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[11px] ${
                  p.tier === "companies" ? "bg-gold-500/20 text-gold-300" :
                  p.tier === "max" ? "bg-brand-500/20 text-brand-300" :
                  p.tier === "pro" ? "bg-emerald-500/20 text-emerald-300" :
                  "bg-slate-500/20 text-slate-300"
                }`}>{p.tier}</span>
                <button onClick={() => toggleArchive(p)} disabled={pending} className={`px-2 py-0.5 rounded text-[11px] disabled:opacity-50 ${p.status === "archived" ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}>
                  {p.status === "archived" ? "استعادة" : "أرشفة"}
                </button>
              </div>
            </div>

            {editing === p.slug ? (
              <div className="space-y-2 text-xs">
                <Field label="الاسم (عربي)" value={p.name} onChange={v => update(p.slug, { name: v })} />
                <Field label="الاسم (EN)" value={p.nameEn} onChange={v => update(p.slug, { nameEn: v })} />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="السعر/شهر ($)" type="number" value={p.priceUsd} onChange={v => update(p.slug, { priceUsd: Number(v) })} />
                  <Field label="السعر/سنة ($، فارغ=لا يوجد)" type="number" value={p.yearlyUsd ?? ""} onChange={v => update(p.slug, { yearlyUsd: v === "" ? null : Number(v) })} />
                </div>
                <Field label="الوصف" value={p.description} onChange={v => update(p.slug, { description: v })} />
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
