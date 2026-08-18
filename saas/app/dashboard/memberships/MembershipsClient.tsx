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

interface Props {
  publicPlans: Plan[];
  legacyPlans: Plan[];
  promotions: Promotion[];
  subscriberCounts: Record<string, number>;
}

const PUBLIC_SLUGS = new Set(['k_start', 'k_growth', 'k_pro', 'k_enterprise']);

const planColor: Record<string, string> = {
  k_start: '#64748b',
  k_growth: '#2563eb',
  k_pro: '#7c3aed',
  k_enterprise: '#b91c1c',
};

const tierLabel: Record<string, string> = {
  basic: 'Basic', pro: 'Pro', max: 'Max', companies: 'Enterprise',
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
      await onSave(plan.slug, {
        ...form,
        yearlyUsd: form.yearlyUsd === '' ? null : Number(form.yearlyUsd),
      });
      setEditing(false);
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  }

  const accentColor = planColor[plan.slug] || '#6b7280';
  const isLegacy = !PUBLIC_SLUGS.has(plan.slug);

  return (
    <div style={{
      border: `2px solid ${accentColor}30`, borderRadius: '10px', overflow: 'hidden',
      opacity: plan.status === 'archived' ? 0.65 : 1,
    }}>
      {/* Header */}
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

      {/* Body */}
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '11px', padding: '2px 8px', borderRadius: '99px',
            background: plan.status === 'active' ? '#d1fae5' : '#fee2e2',
            color: plan.status === 'active' ? '#065f46' : '#991b1b', fontWeight: '600',
          }}>{plan.status}</span>
          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', background: '#eff6ff', color: '#1e40af', fontWeight: '600' }}>
            {tierLabel[plan.tier] || plan.tier}
          </span>
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
              { label: 'Price (USD/mo)', key: 'priceUsd', type: 'number' },
              { label: 'Yearly (USD)', key: 'yearlyUsd', type: 'number' },
              { label: 'Messages/mo', key: 'monthlyMsgs', type: 'number' },
              { label: 'AI Requests/mo', key: 'aiRequestsMonthly', type: 'number' },
              { label: 'Broadcasts/mo', key: 'broadcastsMonthly', type: 'number' },
              { label: 'WA Sessions', key: 'whatsappSessions', type: 'number' },
              { label: 'Rate Limit/min', key: 'rateLimitPerMin', type: 'number' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '2px' }}>{label}</label>
                <input
                  type="number"
                  value={(form as any)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '12px' }}
                />
              </div>
            ))}
            <div>
              <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                style={{ width: '100%', padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '12px' }}
              >
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

export default function MembershipsClient({ publicPlans, legacyPlans, promotions: initialPromos, subscriberCounts }: Props) {
  const [plans, setPlans] = useState({ public: publicPlans, legacy: legacyPlans });
  const [promotions] = useState(initialPromos);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<'plans' | 'promotions'>('plans');

  async function handleSavePlan(slug: string, data: object) {
    const res = await fetch('/api/admin/plans', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, ...data }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? json.detail ?? 'Failed');
    // Update local state
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
        {[['plans', 'Plans & Pricing'], ['promotions', 'Promotions']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as any)}
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

      {tab === 'plans' && (
        <>
          {/* Public plans */}
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

          {/* Legacy plans */}
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
                <span style={{
                  padding: '1px 6px', borderRadius: '99px', fontSize: '11px', fontWeight: '600',
                  background: p.status === 'active' ? '#d1fae5' : '#f1f5f9',
                  color: p.status === 'active' ? '#065f46' : '#6b7280',
                }}>{p.status}</span>
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
