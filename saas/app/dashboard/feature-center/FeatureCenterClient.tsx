'use client';

import { useState, useMemo } from 'react';

interface RegistryFeature {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  type: 'feature' | 'subfeature' | 'admin_internal';
  category: string;
  parentFeature?: string;
  capability: string;
  routes: string[];
  apiFamilies: string[];
  notes?: string;
}

interface ControlRow {
  featureId: string;
  status: string;
  customerVisible: boolean;
  adminOnly: boolean;
  beta: boolean;
  killSwitch: boolean;
  rolloutPct: number;
  requiredPlan: string | null;
  releaseId: string | null;
  dependencies: string[];
}

interface MergedFeature extends RegistryFeature {
  ctrl: ControlRow;
}

interface Props {
  features: MergedFeature[];
}

const STATUS_OPTIONS = ['enabled', 'disabled', 'hidden', 'beta', 'deprecated'];
const PLAN_OPTIONS = ['', 'k_start', 'k_growth', 'k_pro', 'k_enterprise'];

const statusColor: Record<string, string> = {
  enabled: '#16a34a',
  beta: '#2563eb',
  disabled: '#dc2626',
  hidden: '#d97706',
  deprecated: '#6b7280',
};

const planLabel: Record<string, string> = {
  '': 'any',
  k_start: 'Start',
  k_growth: 'Growth',
  k_pro: 'Pro',
  k_enterprise: 'Enterprise',
};

const planColor: Record<string, string> = {
  '': '#6b7280',
  k_start: '#64748b',
  k_growth: '#2563eb',
  k_pro: '#7c3aed',
  k_enterprise: '#b91c1c',
};

type Saving = Record<string, boolean>;

export default function FeatureCenterClient({ features: initial }: Props) {
  const [features, setFeatures] = useState<MergedFeature[]>(initial);
  const [saving, setSaving] = useState<Saving>({});
  const [error, setError] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);

  const categories = useMemo(() => [...new Set(features.map(f => f.category))].sort(), [features]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return features.filter(f => {
      if (search && !f.nameEn.toLowerCase().includes(q) && !f.key.includes(q) && !f.nameAr.includes(q)) return false;
      if (filterStatus && f.ctrl.status !== filterStatus) return false;
      if (filterPlan && f.ctrl.requiredPlan !== filterPlan) return false;
      if (filterCategory && f.category !== filterCategory) return false;
      return true;
    });
  }, [features, search, filterStatus, filterPlan, filterCategory]);

  const byCategory = useMemo(() => {
    const m: Record<string, MergedFeature[]> = {};
    for (const f of filtered) {
      if (!m[f.category]) m[f.category] = [];
      m[f.category].push(f);
    }
    return m;
  }, [filtered]);

  async function patch(featureId: string, body: object) {
    setSaving(s => ({ ...s, [featureId]: true }));
    setError(e => { const n = { ...e }; delete n[featureId]; return n; });
    try {
      const res = await fetch(`/api/admin/feature-control/${featureId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setFeatures(prev => prev.map(f =>
        f.key === featureId ? { ...f, ctrl: { ...f.ctrl, ...body } } : f
      ));
      setToast(`${featureId} updated`);
      setTimeout(() => setToast(null), 2000);
    } catch (e: any) {
      setError(err => ({ ...err, [featureId]: e.message }));
    } finally {
      setSaving(s => { const n = { ...s }; delete n[featureId]; return n; });
    }
  }

  const total = features.length;
  const enabled = features.filter(f => f.ctrl.status === 'enabled').length;
  const killed = features.filter(f => f.ctrl.killSwitch).length;
  const hidden = features.filter(f => f.ctrl.status === 'hidden' || !f.ctrl.customerVisible).length;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '24px', maxWidth: '1400px' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', margin: '0 0 2px' }}>Feature Control Center</h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '13px' }}>Live controls — changes apply within 30 seconds</p>
        </div>
        {toast && (
          <div style={{ background: '#d1fae5', color: '#065f46', padding: '6px 14px', borderRadius: '6px', fontSize: '13px' }}>
            ✓ {toast}
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total', value: total, color: '#1e293b' },
          { label: 'Enabled', value: enabled, color: '#16a34a' },
          { label: 'Kill-Switched', value: killed, color: '#dc2626' },
          { label: 'Hidden', value: hidden, color: '#d97706' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px' }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>{label}</div>
            <div style={{ fontSize: '26px', fontWeight: '700', color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search features…"
          style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', flex: '1', minWidth: '180px' }}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}>
          <option value="">All plans</option>
          {PLAN_OPTIONS.filter(p => p).map(p => <option key={p} value={p}>{planLabel[p]}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontSize: '12px', color: '#6b7280', alignSelf: 'center' }}>{filtered.length} shown</span>
      </div>

      {/* Feature table by category */}
      {Object.entries(byCategory).map(([category, catFeatures]) => {
        const isExpanded = expandedCategory[category] !== false; // default expanded
        return (
          <div key={category} style={{ marginBottom: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
            <button
              onClick={() => setExpandedCategory(prev => ({ ...prev, [category]: !isExpanded }))}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', background: '#f8fafc', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569',
              }}
            >
              <span>{category} ({catFeatures.length})</span>
              <span>{isExpanded ? '▲' : '▼'}</span>
            </button>

            {isExpanded && (
              <div>
                {/* Column headers */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '200px 1fr 100px 110px 80px 80px 80px 70px',
                  gap: '8px', padding: '6px 16px',
                  background: '#f1f5f9', borderBottom: '1px solid #e2e8f0',
                  fontSize: '11px', fontWeight: '600', color: '#64748b',
                }}>
                  <span>Feature</span>
                  <span>Key / Routes</span>
                  <span>Status</span>
                  <span>Plan</span>
                  <span>Rollout%</span>
                  <span>Visible</span>
                  <span>Kill</span>
                  <span>Type</span>
                </div>

                {catFeatures.map((f, i) => (
                  <div key={f.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '200px 1fr 100px 110px 80px 80px 80px 70px',
                    gap: '8px', padding: '10px 16px', alignItems: 'center',
                    background: f.ctrl.killSwitch ? '#fff5f5' : (i % 2 === 0 ? '#fff' : '#f8fafc'),
                    borderBottom: i < catFeatures.length - 1 ? '1px solid #f1f5f9' : 'none',
                    opacity: saving[f.key] ? 0.6 : 1,
                  }}>
                    {/* Name */}
                    <div>
                      <div style={{ fontWeight: '500', fontSize: '13px' }}>{f.nameEn}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', direction: 'rtl', textAlign: 'left' }}>{f.nameAr}</div>
                      {f.parentFeature && <div style={{ fontSize: '10px', color: '#94a3b8' }}>↳ {f.parentFeature}</div>}
                      {error[f.key] && <div style={{ fontSize: '10px', color: '#dc2626' }}>✗ {error[f.key]}</div>}
                    </div>

                    {/* Key / Routes */}
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>{f.key}</div>
                      {f.routes.slice(0, 2).map(r => (
                        <div key={r} style={{ fontSize: '10px', color: '#94a3b8' }}>{r}</div>
                      ))}
                    </div>

                    {/* Status */}
                    <select
                      value={f.ctrl.status}
                      disabled={saving[f.key]}
                      onChange={e => patch(f.key, { status: e.target.value })}
                      style={{
                        fontSize: '11px', padding: '2px 4px', border: '1px solid #e2e8f0', borderRadius: '4px',
                        background: `${statusColor[f.ctrl.status] || '#6b7280'}18`,
                        color: statusColor[f.ctrl.status] || '#6b7280', fontWeight: '600',
                        cursor: 'pointer',
                      }}
                    >
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    {/* Plan */}
                    <select
                      value={f.ctrl.requiredPlan ?? ''}
                      disabled={saving[f.key]}
                      onChange={e => patch(f.key, { requiredPlan: e.target.value || null })}
                      style={{
                        fontSize: '11px', padding: '2px 4px', border: '1px solid #e2e8f0', borderRadius: '4px',
                        color: planColor[f.ctrl.requiredPlan ?? ''], fontWeight: '600', cursor: 'pointer',
                      }}
                    >
                      {PLAN_OPTIONS.map(p => <option key={p} value={p}>{planLabel[p] ?? p}</option>)}
                    </select>

                    {/* Rollout % */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number" min={0} max={100}
                        value={f.ctrl.rolloutPct}
                        disabled={saving[f.key]}
                        onChange={e => {
                          const v = parseInt(e.target.value, 10);
                          if (!isNaN(v) && v >= 0 && v <= 100) {
                            setFeatures(prev => prev.map(x => x.key === f.key ? { ...x, ctrl: { ...x.ctrl, rolloutPct: v } } : x));
                          }
                        }}
                        onBlur={e => patch(f.key, { rolloutPct: parseInt(e.target.value, 10) || 100 })}
                        style={{ width: '44px', fontSize: '11px', padding: '2px 4px', border: '1px solid #e2e8f0', borderRadius: '4px', textAlign: 'center' }}
                      />
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>%</span>
                    </div>

                    {/* Customer Visible */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '11px' }}>
                      <input
                        type="checkbox"
                        checked={f.ctrl.customerVisible}
                        disabled={saving[f.key]}
                        onChange={e => patch(f.key, { customerVisible: e.target.checked })}
                      />
                      <span style={{ color: f.ctrl.customerVisible ? '#16a34a' : '#dc2626' }}>
                        {f.ctrl.customerVisible ? 'yes' : 'no'}
                      </span>
                    </label>

                    {/* Kill Switch */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '11px' }}>
                      <input
                        type="checkbox"
                        checked={f.ctrl.killSwitch}
                        disabled={saving[f.key]}
                        onChange={e => patch(f.key, { killSwitch: e.target.checked })}
                      />
                      <span style={{ color: f.ctrl.killSwitch ? '#dc2626' : '#94a3b8', fontWeight: f.ctrl.killSwitch ? '700' : 'normal' }}>
                        {f.ctrl.killSwitch ? '🔴 ON' : 'off'}
                      </span>
                    </label>

                    {/* Type */}
                    <div>
                      <span style={{
                        fontSize: '10px', padding: '1px 6px', borderRadius: '99px',
                        background: f.type === 'admin_internal' ? '#fee2e2' : f.type === 'subfeature' ? '#f0fdf4' : '#eff6ff',
                        color: f.type === 'admin_internal' ? '#991b1b' : f.type === 'subfeature' ? '#166534' : '#1e40af',
                      }}>
                        {f.type}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>No features match filters.</div>
      )}
    </div>
  );
}
