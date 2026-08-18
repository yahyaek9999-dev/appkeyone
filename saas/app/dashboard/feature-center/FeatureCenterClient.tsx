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

interface Stats {
  customerFeatures: number;
  subFeatures: number;
  adminFeatures: number;
  totalRegistry: number;
  persistedControls: number;
  active: number;
  disabled: number;
  hidden: number;
  beta: number;
  killed: number;
  customerVisible: number;
}

interface Props {
  features: MergedFeature[];
  stats: Stats;
}

const STATUS_OPTIONS = ['enabled', 'disabled', 'hidden', 'beta', 'deprecated'];
const PLAN_OPTIONS = ['', 'k_start', 'k_growth', 'k_pro', 'k_enterprise'];
const TYPE_OPTIONS = ['', 'feature', 'subfeature', 'admin_internal'];

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

export default function FeatureCenterClient({ features: initial, stats }: Props) {
  const [features, setFeatures] = useState<MergedFeature[]>(initial);
  const [saving, setSaving] = useState<Saving>({});
  const [error, setError] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ added: number; existing: number; total: number } | null>(null);

  const categories = useMemo(() => [...new Set(features.map(f => f.category))].sort(), [features]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return features.filter(f => {
      if (search && !f.nameEn.toLowerCase().includes(q) && !f.key.includes(q) && !f.nameAr.includes(q)) return false;
      if (filterStatus && f.ctrl.status !== filterStatus) return false;
      if (filterPlan && (f.ctrl.requiredPlan ?? '') !== filterPlan) return false;
      if (filterCategory && f.category !== filterCategory) return false;
      if (filterType && f.type !== filterType) return false;
      return true;
    });
  }, [features, search, filterStatus, filterPlan, filterCategory, filterType]);

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

  async function syncRegistry() {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/feature-control/sync', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'sync failed');
      setSyncResult({ added: json.added, existing: json.existing, total: json.total });
      setToast(`Sync complete — ${json.added} added, ${json.existing} already persisted`);
      setTimeout(() => setToast(null), 4000);
    } catch (e: any) {
      setToast(`Sync failed: ${e.message}`);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSyncing(false);
    }
  }

  const notPersisted = stats.totalRegistry - stats.persistedControls;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '24px', maxWidth: '1400px' }}>

      {/* Header */}
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', margin: '0 0 2px' }}>مركز التحكم بالمنتج</h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '13px' }}>Feature Control Center — changes apply within 30 seconds</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {notPersisted > 0 && (
            <span style={{ fontSize: '12px', color: '#d97706', background: '#fef9c3', padding: '3px 10px', borderRadius: '6px', border: '1px solid #fde047' }}>
              {notPersisted} features use default state (not persisted)
            </span>
          )}
          <button
            onClick={syncRegistry}
            disabled={syncing}
            style={{
              padding: '6px 14px', background: syncing ? '#94a3b8' : '#2563eb', color: '#fff',
              border: 'none', borderRadius: '6px', fontSize: '12px', cursor: syncing ? 'not-allowed' : 'pointer', fontWeight: '600',
            }}
          >
            {syncing ? 'Syncing…' : 'Sync Registry → DB'}
          </button>
          {toast && (
            <div style={{ background: '#d1fae5', color: '#065f46', padding: '6px 14px', borderRadius: '6px', fontSize: '13px' }}>
              ✓ {toast}
            </div>
          )}
        </div>
      </div>

      {/* Classification Banner */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
          Product Inventory — from master-feature-registry.json
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
          {[
            { label: 'Customer Features', value: stats.customerFeatures, color: '#2563eb', note: 'type=feature' },
            { label: 'Sub / Embedded', value: stats.subFeatures, color: '#7c3aed', note: 'type=subfeature' },
            { label: 'Admin / Internal', value: stats.adminFeatures, color: '#dc2626', note: 'type=admin_internal' },
            { label: 'Total Registry', value: stats.totalRegistry, color: '#1e293b', note: 'all types' },
            { label: 'Persisted in DB', value: stats.persistedControls, color: '#16a34a', note: 'FeatureControl rows' },
            { label: 'Active', value: stats.active, color: '#16a34a', note: 'status=enabled' },
            { label: 'Disabled', value: stats.disabled, color: '#dc2626', note: 'status=disabled' },
            { label: 'Hidden', value: stats.hidden, color: '#d97706', note: 'status=hidden' },
            { label: 'Kill-Switched', value: stats.killed, color: '#dc2626', note: 'killSwitch=true' },
            { label: 'Customer Visible', value: stats.customerVisible, color: '#0891b2', note: 'customerVisible=true' },
          ].map(({ label, value, color, note }) => (
            <div key={label} style={{ background: '#fff', borderRadius: '8px', padding: '10px 14px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>{label}</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color }}>{value}</div>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>{note}</div>
            </div>
          ))}
        </div>
        {syncResult && (
          <div style={{ marginTop: '12px', fontSize: '12px', color: '#16a34a', background: '#f0fdf4', padding: '8px 12px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
            Last sync: {syncResult.added} rows added, {syncResult.existing} already existed. Total: {syncResult.total}
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search features…"
          style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', flex: '1', minWidth: '180px' }}
        />
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}>
          <option value="">All types</option>
          <option value="feature">Customer Features</option>
          <option value="subfeature">Sub-Features</option>
          <option value="admin_internal">Admin Internal</option>
        </select>
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
        const isExpanded = expandedCategory[category] !== false;
        const adminCat = catFeatures.every(f => f.type === 'admin_internal');
        return (
          <div key={category} style={{ marginBottom: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
            <button
              onClick={() => setExpandedCategory(prev => ({ ...prev, [category]: !isExpanded }))}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', background: adminCat ? '#fef2f2' : '#f8fafc', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em',
                color: adminCat ? '#991b1b' : '#475569',
              }}
            >
              <span>
                {adminCat && '🔒 '}
                {category} ({catFeatures.length})
              </span>
              <span>{isExpanded ? '▲' : '▼'}</span>
            </button>

            {isExpanded && (
              <div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '200px 1fr 100px 110px 80px 80px 80px 90px',
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
                    gridTemplateColumns: '200px 1fr 100px 110px 80px 80px 80px 90px',
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
                        color: statusColor[f.ctrl.status] || '#6b7280', fontWeight: '600', cursor: 'pointer',
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
                          if (!isNaN(v) && v >= 0 && v <= 100)
                            setFeatures(prev => prev.map(x => x.key === f.key ? { ...x, ctrl: { ...x.ctrl, rolloutPct: v } } : x));
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
                        {f.type === 'admin_internal' ? 'admin' : f.type === 'subfeature' ? 'sub' : 'feature'}
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
        <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
          No features match the current filters.
        </div>
      )}
    </div>
  );
}
