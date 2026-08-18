'use client';

import { useState } from 'react';

interface Plan {
  slug: string;
  name: string;
  nameEn: string;
  description: string;
  priceUsd: number;
  yearlyUsd: number | null;
  monthlyMsgs: number;
  status: string;
  tier: string;
  aiRequestsMonthly: number;
  broadcastsMonthly: number;
  whatsappSessions: number;
  metaAccess: string;
  analyticsAccess: string;
  queuePriority: number;
  rateLimitPerMin: number;
  featureFlags: Record<string, any>;
}

interface Promotion {
  id: string;
  code: string;
  type: string;
  value: number;
  targetPlan: string | null;
  status: string;
  expiresAt: string | null;
  usageCount: number;
  maxUsage: number | null;
}

interface RegistryFeature {
  key: string;
  nameEn: string;
  nameAr: string;
  type: string;
  category: string;
  parentFeature?: string;
  requiredPlan?: string;
}

interface Props {
  publicPlans: Plan[];
  legacyPlans: Plan[];
  promotions: Promotion[];
  subscriberCounts: Record<string, number>;
  planFeatures: Record<string, RegistryFeature[]>;
}

const PUBLIC_SLUGS = new Set(['k_start', 'k_growth', 'k_pro', 'k_enterprise']);

const planColor: Record<string, string> = {
  k_start: '#64748b',
  k_growth: '#2563eb',
  k_pro: '#7c3aed',
  k_enterprise: '#b91c1c',
};

const planDisplayName: Record<string, string> = {
  k_start: 'KEYONE Start',
  k_growth: 'KEYONE Growth',
  k_pro: 'KEYONE Pro',
  k_enterprise: 'KEYONE Enterprise',
};

const tierLabel: Record<string, string> = {
  basic: 'Basic', pro: 'Pro', max: 'Max', companies: 'Enterprise',
};

const categoryLabel: Record<string, string> = {
  conversations: 'Conversations',
  customers: 'Customers & CRM',
  sales: 'Sales & Orders',
  marketing: 'Marketing',
  automation: 'Automation',
  ai: 'AI & Intelligence',
  analytics: 'Analytics',
  settings: 'Settings',
  integrations: 'Integrations',
  developer: 'Developer',
  security: 'Security',
  admin: 'Admin',
};

function PlanCard({ plan, subscriberCount, onSave }: { plan: Plan; subscriberCount: number; onSave: (slug: string, data: object) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    priceUsd: plan.priceUsd,
    yearlyUsd: plan.yearlyUsd ?? '',
    status: plan.status,
    aiRequestsMonthly: plan.aiRequestsMonthly,
    broadcastsMonthly: plan.broadcastsMonthly,
    whatsappSessions: plan.whatsappSessions,
    monthlyMsgs: plan.monthlyMsgs,
    rateLimitPerMin: plan.rateLimitPerMin,
  });

  async function save() {
    setSaving(true); setErr('');
    try {
      await onSave(plan.slug, { ...form, yearlyUsd: form.yearlyUsd === '' ? null : Number(form.yearlyUsd) });
      setEditing(false);
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  }

  const accentColor = planColor[plan.slug] || '#6b7280';
  const isLegacy = !PUBLIC_SLUGS.has(plan.slug);

  return (
    <div style={{ border: `2px solid ${accentColor}30`, borderRadius: '10px', overflow: 'hidden', opacity: plan.status === 'archived' ? 0.65 : 1 }}>
      <div style={{ background: `${accentColor}12`, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: '700', fontSize: '15px', color: accentColor }}>{plan.nameEn || plan.name}</div>
          <div style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>{plan.slug}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: '700', fontSize: '20px' }}>${plan.priceUsd}<span style={{ fontSize: '12px', fontWeight: '400', color: '#6b7280' }}>/mo</span></div>
          {plan.yearlyUsd && <div style={{ fontSize: '11px', color: '#6b7280' }}>${plan.yearlyUsd}/yr</div>}
        </div>
      </div>

      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', background: plan.status === 'active' ? '#d1fae5' : '#fee2e2', color: plan.status === 'active' ? '#065f46' : '#991b1b', fontWeight: '600' }}>{plan.status}</span>
          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', background: '#eff6ff', color: '#1e40af', fontWeight: '600' }}>{tierLabel[plan.tier] || plan.tier}</span>
          {isLegacy && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', background: '#fef9c3', color: '#854d0e', fontWeight: '600' }}>legacy</span>}
          <span style={{ fontSize: '11px', color: '#6b7280' }}>{subscriberCount} subscribers</span>
        </div>

        {!editing ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '12px' }}>
            <div><span style={{ color: '#6b7280' }}>Messages/mo:</span> {plan.monthlyMsgs.toLocaleString()}</div>
            <div><span style={{ color: '#6b7280' }}>AI/mo:</span> {plan.aiRequestsMonthly.toLocaleString()}</div>
            <div><span style={{ color: '#6b7280' }}>Broadcasts/mo:</span> {plan.broadcastsMonthly.toLocaleString()}</div>
            <div><span style={{ color: '#6b7280' }}>WA Sessions:</span> {plan.whatsappSessions}</div>
            <div><span style={{ color: '#6b7280' }}>Rate limit:</span> {plan.rateLimitPerMin}/min</div>
            <div><span style={{ color: '#6b7280' }}>Queue priority:</span> {plan.queuePriority}</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {[
              { label: 'Price (USD/mo)', key: 'priceUsd' },
              { label: 'Yearly (USD)', key: 'yearlyUsd' },
              { label: 'Messages/mo', key: 'monthlyMsgs' },
              { label: 'AI Requests/mo', key: 'aiRequestsMonthly' },
              { label: 'Broadcasts/mo', key: 'broadcastsMonthly' },
              { label: 'WA Sessions', key: 'whatsappSessions' },
              { label: 'Rate Limit/min', key: 'rateLimitPerMin' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '2px' }}>{label}</label>
                <input type="number" value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '12px' }} />
              </div>
            ))}
            <div>
              <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                style={{ width: '100%', padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '12px' }}>
                <option value="active">active</option>
                <option value="archived">archived</option>
              </select>
            </div>
          </div>
        )}

        {err && <div style={{ color: '#dc2626', fontSize: '11px', marginTop: '8px' }}>✗ {err}</div>}

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          {editing ? (
            <>
              <button onClick={save} disabled={saving}
                style={{ flex: 1, padding: '6px', background: accentColor, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)}
                style={{ padding: '6px 12px', background: '#f1f5f9', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)}
              style={{ padding: '6px 12px', background: '#f1f5f9', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Features by Plan matrix ──────────────────────────────────────────────────

function FeaturesByPlan({ planFeatures }: { planFeatures: Record<string, RegistryFeature[]> }) {
  const [activePlan, setActivePlan] = useState('k_start');
  const plans = ['k_start', 'k_growth', 'k_pro', 'k_enterprise'];

  const features = planFeatures[activePlan] ?? [];

  // Group by category — only top-level features (exclude subfeatures)
  const topLevel = features.filter(f => f.type === 'feature');
  const byCategory: Record<string, RegistryFeature[]> = {};
  for (const f of topLevel) {
    if (!byCategory[f.category]) byCategory[f.category] = [];
    byCategory[f.category].push(f);
  }

  // For each top-level feature, collect its sub-features
  const subsByParent: Record<string, RegistryFeature[]> = {};
  for (const f of features.filter(f => f.type === 'subfeature')) {
    const parent = f.parentFeature ?? f.category;
    if (!subsByParent[parent]) subsByParent[parent] = [];
    subsByParent[parent].push(f);
  }

  const color = planColor[activePlan] || '#1e293b';
  const prevPlanIdx = plans.indexOf(activePlan) - 1;
  const prevPlanCount = prevPlanIdx >= 0 ? (planFeatures[plans[prevPlanIdx]] ?? []).filter(f => f.type === 'feature').length : 0;
  const newInThisPlan = topLevel.length - prevPlanCount;

  return (
    <div>
      {/* Plan selector tabs */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', background: '#f1f5f9', borderRadius: '8px', padding: '4px', width: 'fit-content' }}>
        {plans.map(slug => (
          <button key={slug} onClick={() => setActivePlan(slug)}
            style={{
              padding: '6px 16px', borderRadius: '6px', border: 'none', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
              background: activePlan === slug ? planColor[slug] : 'transparent',
              color: activePlan === slug ? '#fff' : '#64748b',
              boxShadow: activePlan === slug ? '0 1px 3px rgba(0,0,0,.15)' : 'none',
            }}>
            {planDisplayName[slug].replace('KEYONE ', '')}
          </button>
        ))}
      </div>

      {/* Plan summary */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ background: `${color}10`, border: `1px solid ${color}30`, borderRadius: '10px', padding: '14px 20px', minWidth: '160px' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>{planDisplayName[activePlan]}</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color }}>{topLevel.length}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>customer features</div>
        </div>
        {newInThisPlan > 0 && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px 20px', minWidth: '160px' }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>Added vs previous plan</div>
            <div style={{ fontSize: '32px', fontWeight: '700', color: '#16a34a' }}>+{newInThisPlan}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>new features</div>
          </div>
        )}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 20px', minWidth: '160px' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>Including sub-features</div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#475569' }}>{features.length}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>total (incl. embedded)</div>
        </div>
      </div>

      {/* Feature list by category */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {Object.entries(byCategory)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([category, catFeatures]) => (
            <div key={category} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{
                padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
                fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#475569',
              }}>
                {categoryLabel[category] || category} ({catFeatures.length})
              </div>
              <div style={{ padding: '10px 14px' }}>
                {catFeatures.map(f => {
                  const subs = subsByParent[f.key] ?? [];
                  const isNew = prevPlanIdx < 0
                    ? true
                    : (planFeatures[plans[prevPlanIdx]] ?? []).every((pf: RegistryFeature) => pf.key !== f.key);
                  return (
                    <div key={f.key} style={{ marginBottom: subs.length ? '8px' : '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: color, fontSize: '13px' }}>✓</span>
                        <span style={{ fontSize: '13px', fontWeight: '500' }}>{f.nameEn}</span>
                        {isNew && activePlan !== 'k_start' && (
                          <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '99px', background: `${color}15`, color, fontWeight: '600' }}>NEW</span>
                        )}
                      </div>
                      {subs.length > 0 && (
                        <div style={{ marginLeft: '20px', marginTop: '2px' }}>
                          {subs.map(s => (
                            <div key={s.key} style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '1px' }}>
                              <span>↳</span> <span>{s.nameEn}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
      </div>

      {topLevel.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' }}>
          No customer features found for this plan.
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function MembershipsClient({ publicPlans, legacyPlans, promotions: initialPromos, subscriberCounts, planFeatures }: Props) {
  const [plans, setPlans] = useState({ public: publicPlans, legacy: legacyPlans });
  const [promotions] = useState(initialPromos);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<'plans' | 'features' | 'promotions'>('plans');

  async function handleSavePlan(slug: string, data: object) {
    const res = await fetch('/api/admin/plans', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, ...data }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? json.detail ?? 'Failed');
    setPlans(prev => ({
      public: prev.public.map(p => p.slug === slug ? { ...p, ...(data as any) } : p),
      legacy: prev.legacy.map(p => p.slug === slug ? { ...p, ...(data as any) } : p),
    }));
    setToast(`${slug} updated`);
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '24px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', margin: '0 0 2px' }}>Membership Control</h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '13px' }}>Manage plans, pricing, limits, and offers</p>
        </div>
        {toast && (
          <div style={{ background: '#d1fae5', color: '#065f46', padding: '6px 14px', borderRadius: '6px', fontSize: '13px' }}>
            ✓ {toast}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '24px', background: '#f1f5f9', borderRadius: '8px', padding: '4px', width: 'fit-content' }}>
        {([['plans', 'Plans & Pricing'], ['features', 'Features by Plan'], ['promotions', 'Promotions']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{
              padding: '6px 16px', borderRadius: '6px', border: 'none', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
              background: tab === key ? '#fff' : 'transparent',
              color: tab === key ? '#1e293b' : '#64748b',
              boxShadow: tab === key ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Plans & Pricing */}
      {tab === 'plans' && (
        <>
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', marginBottom: '12px' }}>
              Public Plans ({plans.public.length})
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {plans.public.map(p => (
                <PlanCard key={p.slug} plan={p} subscriberCount={subscriberCounts[p.slug] ?? 0} onSave={handleSavePlan} />
              ))}
            </div>
          </div>

          {plans.legacy.length > 0 && (
            <div>
              <h2 style={{ fontSize: '14px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af', marginBottom: '12px' }}>
                Legacy / Archived ({plans.legacy.length})
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {plans.legacy.map(p => (
                  <PlanCard key={p.slug} plan={p} subscriberCount={subscriberCounts[p.slug] ?? 0} onSave={handleSavePlan} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Features by Plan */}
      {tab === 'features' && (
        <FeaturesByPlan planFeatures={planFeatures} />
      )}

      {/* Promotions */}
      {tab === 'promotions' && (
        <div>
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>{promotions.length} promotions</span>
            <a href="/dashboard/coupons" style={{ fontSize: '13px', color: '#2563eb', textDecoration: 'none' }}>
              → Manage in Coupons →
            </a>
          </div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 100px 80px 120px 80px 100px 80px', gap: '8px', padding: '8px 16px', background: '#f8fafc', fontSize: '11px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
              <span>Code</span><span>Type</span><span>Value</span><span>Target Plan</span><span>Status</span><span>Expires</span><span>Uses</span>
            </div>
            {promotions.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                No promotions. <a href="/dashboard/coupons" style={{ color: '#2563eb' }}>Create one →</a>
              </div>
            )}
            {promotions.map((p, i) => (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '120px 100px 80px 120px 80px 100px 80px', gap: '8px', padding: '10px 16px', fontSize: '12px', background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: i < promotions.length - 1 ? '1px solid #f1f5f9' : 'none', alignItems: 'center' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>{p.code}</span>
                <span style={{ color: '#6b7280' }}>{p.type}</span>
                <span>{p.type === 'percentage' ? `${p.value}%` : `$${p.value}`}</span>
                <span style={{ color: '#6b7280' }}>{p.targetPlan || 'any'}</span>
                <span style={{ padding: '1px 6px', borderRadius: '99px', fontSize: '11px', fontWeight: '600', background: p.status === 'active' ? '#d1fae5' : '#f1f5f9', color: p.status === 'active' ? '#065f46' : '#6b7280' }}>{p.status}</span>
                <span style={{ color: '#6b7280' }}>{p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : '—'}</span>
                <span>{p.usageCount}{p.maxUsage ? `/${p.maxUsage}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
