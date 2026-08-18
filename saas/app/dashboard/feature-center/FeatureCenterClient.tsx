'use client';

import { useState, useMemo, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Ctrl {
  featureId: string;
  name: string;
  description: string;
  category: string;
  workspace: string;
  status: string;
  customerVisible: boolean;
  adminOnly: boolean;
  beta: boolean;
  killSwitch: boolean;
  rolloutPct: number;
  requiredPlan: string | null;
  releaseId: string | null;
  featureSource: string;
  featureType: string;
  adminVisible: boolean;
  dependencies: string[];
}

interface MergedFeature {
  featureId: string;
  name: string;
  nameEn: string;
  nameAr: string;
  type: string;
  category: string;
  parentFeature: string | null;
  capability: string | null;
  routes: string[];
  apiFamilies: string[];
  featureSource: string;
  featureType: string;
  adminVisible: boolean;
  ctrl: Ctrl;
}

interface Stats {
  total: number;
  registryBacked: number;
  legacyTotal: number;
  legacyMapped: number;
  legacyUnmapped: number;
  customerFeatures: number;
  subFeatures: number;
  adminFeatures: number;
  active: number;
  disabled: number;
  hidden: number;
  beta: number;
  killed: number;
  customerVisible: number;
  adminOnly: number;
}

interface Props {
  features: MergedFeature[];
  stats: Stats;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_FILTER_OPTIONS = [
  { key: 'all',             label: 'الكل' },
  { key: 'feature',         label: 'Customer Features' },
  { key: 'subfeature',      label: 'Sub-Features' },
  { key: 'admin_internal',  label: 'Admin/Internal' },
  { key: 'legacy_mapped',   label: 'Legacy / Mapped' },
  { key: 'legacy_unmapped', label: 'Legacy / Unmapped' },
  { key: 'customer_visible',label: 'Customer Visible' },
  { key: 'admin_only',      label: 'Admin Only' },
  { key: 'disabled',        label: 'Disabled' },
  { key: 'hidden',          label: 'Hidden' },
  { key: 'beta',            label: 'Beta' },
  { key: 'killed',          label: 'Kill Switch' },
];

const TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  feature:         { bg: '#dbeafe', text: '#1d4ed8', label: 'Customer Feature' },
  subfeature:      { bg: '#ede9fe', text: '#6d28d9', label: 'Sub-Feature' },
  admin_internal:  { bg: '#fee2e2', text: '#991b1b', label: 'Admin/Internal' },
  legacy_mapped:   { bg: '#fef9c3', text: '#92400e', label: 'Legacy · Mapped' },
  legacy_unmapped: { bg: '#fce7f3', text: '#9d174d', label: 'Legacy · Unmapped' },
};

const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  registry:  { bg: '#d1fae5', text: '#065f46' },
  legacy_db: { bg: '#fef9c3', text: '#92400e' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  enabled:    { bg: '#d1fae5', text: '#065f46' },
  disabled:   { bg: '#fee2e2', text: '#991b1b' },
  hidden:     { bg: '#f1f5f9', text: '#64748b' },
  beta:       { bg: '#ede9fe', text: '#6d28d9' },
  deprecated: { bg: '#f1f5f9', text: '#9ca3af' },
};

const CATEGORY_AR: Record<string, string> = {
  conversations: 'المحادثات',
  customers: 'العملاء',
  sales: 'المبيعات',
  marketing: 'التسويق',
  automation: 'الأتمتة',
  ai: 'الذكاء الاصطناعي',
  analytics: 'التحليلات',
  settings: 'الإعدادات',
  integrations: 'التكاملات',
  developer: 'المطوّرون',
  security: 'الأمان',
  admin: 'إداري',
  core: 'الأساسيات',
  support: 'الدعم',
  intelligence: 'الذكاء',
  messaging: 'المراسلة',
  commerce: 'التجارة',
  team: 'الفريق',
  operations: 'العمليات',
  enterprise: 'المؤسسات',
  scale: 'التوسّع',
};

// ── Stat tile ─────────────────────────────────────────────────────────────────

function Tile({ label, value, color, onClick, active }: {
  label: string; value: number; color: string;
  onClick?: () => void; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${color}20` : '#fff',
        border: `1.5px solid ${active ? color : '#e2e8f0'}`,
        borderRadius: '10px',
        padding: '10px 14px',
        cursor: onClick ? 'pointer' : 'default',
        textAlign: 'left',
        minWidth: '100px',
        flex: '0 0 auto',
      }}
    >
      <div style={{ fontSize: '20px', fontWeight: '700', color }}>{value}</div>
      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', lineHeight: 1.3 }}>{label}</div>
    </button>
  );
}

// ── Visibility toggle ─────────────────────────────────────────────────────────

function VisibilityToggle({
  feature, onToggle,
}: { feature: MergedFeature; onToggle: (id: string, visible: boolean) => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const visible = feature.ctrl.customerVisible && !feature.ctrl.adminOnly;

  async function toggle() {
    if (loading) return;
    setLoading(true);
    try { await onToggle(feature.featureId, !visible); }
    finally { setLoading(false); }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      style={{
        padding: '3px 8px', borderRadius: '6px', border: 'none',
        fontSize: '11px', fontWeight: '600', cursor: 'pointer',
        background: visible ? '#d1fae5' : '#f1f5f9',
        color: visible ? '#065f46' : '#475569',
        opacity: loading ? 0.5 : 1, whiteSpace: 'nowrap',
      }}
    >
      {loading ? '…' : visible ? '✓ Customer Visible' : '⊘ Admin Only'}
    </button>
  );
}

// ── Feature row ───────────────────────────────────────────────────────────────

function FeatureRow({
  feature, onVisibilityToggle,
}: { feature: MergedFeature; onVisibilityToggle: (id: string, visible: boolean) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const tc = TYPE_COLORS[feature.featureType] ?? { bg: '#f1f5f9', text: '#475569', label: feature.featureType };
  const sc = SOURCE_COLORS[feature.featureSource] ?? SOURCE_COLORS.legacy_db;
  const stc = STATUS_COLORS[feature.ctrl.status] ?? STATUS_COLORS.hidden;
  const isLegacy = feature.featureSource === 'legacy_db';

  return (
    <div style={{ borderBottom: '1px solid #f1f5f9', background: isLegacy ? 'rgba(254,249,195,.25)' : '#fff' }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 110px 90px 90px 75px 140px 22px',
          gap: '8px', padding: '10px 16px', cursor: 'pointer', alignItems: 'center',
        }}
      >
        {/* Name + key + route */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: '600' }}>{feature.nameEn || feature.ctrl.description || feature.featureId}</span>
            {feature.ctrl.killSwitch && (
              <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: '#fee2e2', color: '#991b1b', fontWeight: '700' }}>
                KILL SWITCH
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '4px', marginTop: '2px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#94a3b8' }}>{feature.featureId}</span>
            {feature.routes.length > 0 ? (
              <span style={{ fontSize: '10px', color: '#2563eb', background: '#eff6ff', padding: '0 5px', borderRadius: '4px' }}>
                {feature.routes[0]}
              </span>
            ) : (
              <span style={{ fontSize: '10px', color: '#94a3b8', background: '#f8fafc', padding: '0 5px', borderRadius: '4px' }}>
                NO CUSTOMER PAGE
              </span>
            )}
          </div>
        </div>

        {/* Type badge */}
        <div>
          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '5px', background: tc.bg, color: tc.text, fontWeight: '600' }}>
            {tc.label}
          </span>
        </div>

        {/* Category */}
        <div style={{ fontSize: '11px', color: '#475569' }}>
          {CATEGORY_AR[feature.category] ?? feature.category}
        </div>

        {/* Plan */}
        <div style={{ fontSize: '11px', color: '#6b7280' }}>
          {feature.ctrl.requiredPlan?.replace('k_', '') ?? 'any'}
        </div>

        {/* Status */}
        <div>
          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '5px', background: stc.bg, color: stc.text, fontWeight: '600' }}>
            {feature.ctrl.status}
          </span>
        </div>

        {/* Visibility */}
        <div onClick={e => e.stopPropagation()}>
          <VisibilityToggle feature={feature} onToggle={onVisibilityToggle} />
        </div>

        {/* Expand */}
        <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
          {expanded ? '▲' : '▼'}
        </div>
      </div>

      {/* Detail panel */}
      {expanded && (
        <div style={{ padding: '12px 16px 14px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px', fontSize: '12px' }}>
            <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '3px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source</span>
              <span style={{ padding: '2px 8px', borderRadius: '4px', background: sc.bg, color: sc.text, fontSize: '11px', fontWeight: '600' }}>
                {feature.featureSource === 'registry' ? '✦ Registry' : '⚑ Legacy DB'}
              </span>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '3px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Admin Visibility</span>
              <span style={{ color: '#16a34a', fontWeight: '600' }}>Always visible ✓</span>
            </div>
            {feature.nameAr && <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '3px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Arabic Name</span>
              <span>{feature.nameAr}</span>
            </div>}
            {feature.capability && <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '3px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Capability</span>
              <span style={{ fontFamily: 'monospace' }}>{feature.capability}</span>
            </div>}
            {feature.parentFeature && <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '3px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Parent Feature</span>
              <span style={{ fontFamily: 'monospace' }}>{feature.parentFeature}</span>
            </div>}
            <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '3px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rollout</span>
              <span>{feature.ctrl.rolloutPct}%</span>
            </div>
            {feature.ctrl.releaseId && <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '3px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Release</span>
              <span style={{ fontFamily: 'monospace' }}>{feature.ctrl.releaseId}</span>
            </div>}
            {feature.ctrl.dependencies.length > 0 && <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '3px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dependencies</span>
              <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{feature.ctrl.dependencies.join(', ')}</span>
            </div>}
            {feature.routes.length > 0 && <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '3px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Routes</span>
              <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{feature.routes.join(', ')}</span>
            </div>}
            {feature.apiFamilies?.length > 0 && <div>
              <span style={{ color: '#64748b', display: 'block', marginBottom: '3px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>API Families</span>
              <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{feature.apiFamilies.join(', ')}</span>
            </div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function FeatureCenterClient({ features: initialFeatures, stats }: Props) {
  const [features, setFeatures] = useState(initialFeatures);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [syncState, setSyncState] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [syncMsg, setSyncMsg] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = features;
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(f =>
        f.featureId.toLowerCase().includes(q) ||
        (f.nameEn?.toLowerCase() ?? '').includes(q) ||
        (f.nameAr?.toLowerCase() ?? '').includes(q) ||
        (f.category?.toLowerCase() ?? '').includes(q)
      );
    }
    switch (filter) {
      case 'feature':          result = result.filter(f => f.featureType === 'feature'); break;
      case 'subfeature':       result = result.filter(f => f.featureType === 'subfeature'); break;
      case 'admin_internal':   result = result.filter(f => f.featureType === 'admin_internal'); break;
      case 'legacy_mapped':    result = result.filter(f => f.featureType === 'legacy_mapped'); break;
      case 'legacy_unmapped':  result = result.filter(f => f.featureType === 'legacy_unmapped'); break;
      case 'customer_visible': result = result.filter(f => f.ctrl.customerVisible && !f.ctrl.adminOnly && !f.ctrl.killSwitch); break;
      case 'admin_only':       result = result.filter(f => f.ctrl.adminOnly || !f.ctrl.customerVisible); break;
      case 'disabled':         result = result.filter(f => f.ctrl.status === 'disabled'); break;
      case 'hidden':           result = result.filter(f => f.ctrl.status === 'hidden'); break;
      case 'beta':             result = result.filter(f => f.ctrl.status === 'beta'); break;
      case 'killed':           result = result.filter(f => f.ctrl.killSwitch); break;
    }
    return result;
  }, [features, filter, search]);

  const handleVisibilityToggle = useCallback(async (featureId: string, customerVisible: boolean) => {
    const res = await fetch(`/api/admin/feature-control/${featureId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerVisible }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? 'Failed to update');
    }
    setFeatures(prev => prev.map(f =>
      f.featureId === featureId ? { ...f, ctrl: { ...f.ctrl, customerVisible } } : f
    ));
    setToast(`${featureId} → ${customerVisible ? 'customer visible' : 'admin only'}`);
    setTimeout(() => setToast(null), 3000);
  }, []);

  async function handleSync() {
    setSyncState('loading'); setSyncMsg('');
    try {
      const res = await fetch('/api/admin/feature-control/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'sync failed');
      setSyncState('ok');
      setSyncMsg(`added:${data.added} existing:${data.existing} total:${data.total}`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      setSyncState('err'); setSyncMsg(e.message);
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '1300px', padding: '0 0 60px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: '700', margin: '0 0 4px' }}>مركز التحكم بالمنتج</h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '13px' }}>
            Admin sees all {stats.total} controls · Customer visibility is controlled per feature · No entitlements changed
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {toast && <span style={{ fontSize: '12px', color: '#065f46', background: '#d1fae5', padding: '4px 10px', borderRadius: '6px' }}>✓ {toast}</span>}
          <button
            onClick={handleSync} disabled={syncState === 'loading'}
            style={{
              padding: '7px 14px', borderRadius: '7px', border: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
              background: syncState === 'ok' ? '#d1fae5' : syncState === 'err' ? '#fee2e2' : '#1e293b',
              color: syncState === 'ok' ? '#065f46' : syncState === 'err' ? '#991b1b' : '#fff',
            }}
          >
            {syncState === 'loading' ? 'Syncing…'
              : syncState === 'ok' ? `✓ ${syncMsg}`
              : syncState === 'err' ? `✗ ${syncMsg}`
              : 'Sync Registry → DB'}
          </button>
        </div>
      </div>

      {/* Product Inventory banner */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 18px', marginBottom: '16px' }}>
        <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: '10px' }}>
          PRODUCT INVENTORY — {stats.total} TOTAL FEATURE CONTROLS
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Tile label="Total Controls" value={stats.total} color="#1e293b" />
          <div style={{ width: '1px', background: '#e2e8f0', margin: '0 2px', alignSelf: 'stretch' }} />
          <Tile label="Canonical" value={stats.registryBacked} color="#2563eb" onClick={() => setFilter('all')} active={filter === 'all'} />
          <Tile label="Customer Features" value={stats.customerFeatures} color="#0284c7" onClick={() => setFilter('feature')} active={filter === 'feature'} />
          <Tile label="Sub-Features" value={stats.subFeatures} color="#7c3aed" onClick={() => setFilter('subfeature')} active={filter === 'subfeature'} />
          <Tile label="Admin/Internal" value={stats.adminFeatures} color="#dc2626" onClick={() => setFilter('admin_internal')} active={filter === 'admin_internal'} />
          <div style={{ width: '1px', background: '#e2e8f0', margin: '0 2px', alignSelf: 'stretch' }} />
          <Tile label="Legacy DB" value={stats.legacyTotal} color="#92400e" onClick={() => { setFilter('legacy_mapped'); }} active={filter === 'legacy_mapped' || filter === 'legacy_unmapped'} />
          <Tile label="Legacy Mapped" value={stats.legacyMapped} color="#b45309" onClick={() => setFilter('legacy_mapped')} active={filter === 'legacy_mapped'} />
          <Tile label="Legacy Unmapped" value={stats.legacyUnmapped} color="#9d174d" onClick={() => setFilter('legacy_unmapped')} active={filter === 'legacy_unmapped'} />
        </div>
      </div>

      {/* Visibility + runtime state */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 18px', marginBottom: '16px' }}>
        <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: '10px' }}>
          VISIBILITY &amp; RUNTIME STATE
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Tile label="Customer Visible" value={stats.customerVisible} color="#16a34a" onClick={() => setFilter('customer_visible')} active={filter === 'customer_visible'} />
          <Tile label="Admin Only" value={stats.adminOnly} color="#475569" onClick={() => setFilter('admin_only')} active={filter === 'admin_only'} />
          <div style={{ width: '1px', background: '#e2e8f0', margin: '0 2px', alignSelf: 'stretch' }} />
          <Tile label="Active" value={stats.active} color="#16a34a" />
          <Tile label="Disabled" value={stats.disabled} color="#dc2626" onClick={() => setFilter('disabled')} active={filter === 'disabled'} />
          <Tile label="Hidden" value={stats.hidden} color="#64748b" onClick={() => setFilter('hidden')} active={filter === 'hidden'} />
          <Tile label="Beta" value={stats.beta} color="#7c3aed" onClick={() => setFilter('beta')} active={filter === 'beta'} />
          <Tile label="Kill Switch" value={stats.killed} color="#dc2626" onClick={() => setFilter('killed')} active={filter === 'killed'} />
        </div>
      </div>

      {/* Separation notice */}
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: '#92400e' }}>
        <strong>Admin sees all {stats.total} controls.</strong>
        {' '}Customer dashboard only shows features where{' '}
        <code style={{ background: '#fef3c7', padding: '0 4px', borderRadius: '3px' }}>customerVisible=true</code>
        {' '}+ plan entitlement + active status are all satisfied.
        {' '}Toggle the button on any row to control customer visibility. Changes persist to DB immediately.
      </div>

      {/* Filter + search bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search key, name, category…"
          style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', width: '220px', outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {TYPE_FILTER_OPTIONS.map(opt => (
            <button
              key={opt.key} onClick={() => setFilter(opt.key)}
              style={{
                padding: '4px 9px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: '500', cursor: 'pointer',
                background: filter === opt.key ? '#1e293b' : '#f1f5f9',
                color: filter === opt.key ? '#fff' : '#475569',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feature list */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
        {/* Header row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 110px 90px 90px 75px 140px 22px',
          gap: '8px', padding: '8px 16px',
          background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
          fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b',
        }}>
          <span>Feature / Key / Route</span>
          <span>Type</span>
          <span>Category</span>
          <span>Plan</span>
          <span>Status</span>
          <span>Customer Visibility</span>
          <span></span>
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
            No features match the current filter.
          </div>
        ) : (
          filtered.map(f => (
            <FeatureRow key={f.featureId} feature={f} onVisibilityToggle={handleVisibilityToggle} />
          ))
        )}

        {/* Footer */}
        <div style={{
          padding: '10px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0',
          fontSize: '12px', color: '#64748b', display: 'flex', justifyContent: 'space-between',
        }}>
          <span>Showing <strong>{filtered.length}</strong> of <strong>{stats.total}</strong> feature controls</span>
          <span>Registry: {stats.registryBacked} · Legacy DB: {stats.legacyTotal}</span>
        </div>
      </div>
    </div>
  );
}
