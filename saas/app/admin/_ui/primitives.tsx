// Shared Admin UI primitives — the enterprise control language in React.
// All styling comes from admin-ui.css (.adm-* classes). No decoration, no glow.
// Server-safe (no "use client") so these compose in server components.

import React from "react";
import Link from "next/link";

// ── Page header ──────────────────────────────────────────────────────────────
export function PageHeader({
  eyebrow, title, subtitle, actions,
}: { eyebrow?: string; title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="adm-page-head">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          {eyebrow && <div className="adm-eyebrow">{eyebrow}</div>}
          <h1 className="adm-title">{title}</h1>
          {subtitle && <p className="adm-subtitle">{subtitle}</p>}
        </div>
        {actions && <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>{actions}</div>}
      </div>
    </div>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────
export function Section({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="adm-section">
      {(title || action) && (
        <div className="adm-section-head">
          {title ? <h2 className="adm-section-title">{title}</h2> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

// ── Metric band ──────────────────────────────────────────────────────────────
export type MetricItem = { label: string; value: React.ReactNode; sub?: string; icon?: React.ReactNode };

export function MetricBand({ items }: { items: MetricItem[] }) {
  return (
    <div className="adm-band">
      {items.map((m, i) => (
        <div key={i} className="adm-metric">
          <div className="adm-metric-label">{m.icon}{m.label}</div>
          <div className="adm-metric-value">{m.value}</div>
          {m.sub && <div className="adm-metric-sub">{m.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Status pill ──────────────────────────────────────────────────────────────
export type PillTone = "ok" | "warn" | "bad" | "info" | "neutral";

export function StatusPill({ tone, children, dot = true }: { tone: PillTone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={`adm-pill adm-pill-${tone}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────
export function Panel({ pad = true, children, className = "" }: { pad?: boolean; children: React.ReactNode; className?: string }) {
  return <div className={`adm-panel ${pad ? "adm-panel-pad" : ""} ${className}`}>{children}</div>;
}

// ── Empty state ──────────────────────────────────────────────────────────────
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="adm-empty">{children}</div>;
}

// ── Table shell ──────────────────────────────────────────────────────────────
export function TableShell({ head, foot, children }: { head: React.ReactNode; foot?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="adm-tablewrap">
      <div className="adm-tablescroll">
        <table className="adm-table">
          <thead>{head}</thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {foot && <div className="adm-table-foot">{foot}</div>}
    </div>
  );
}

// ── Toolbar ──────────────────────────────────────────────────────────────────
export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="adm-toolbar">{children}</div>;
}

// ── Tenant link (shared) ─────────────────────────────────────────────────────
export function TenantLink({ id, label }: { id: string; label: string }) {
  return <Link href={`/admin/tenants/${id}`} className="adm-link" dir="ltr">{label}</Link>;
}
