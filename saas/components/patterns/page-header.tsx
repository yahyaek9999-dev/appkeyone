import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * PageHeader — the single composition that opens an operational page.
 *
 * This is the canonical page header. Phase 11 briefly introduced a second,
 * richer implementation at `components/ui/page-header.tsx`; rather than run two
 * competing header systems, its additions were folded in here and that file was
 * removed. Every existing call site keeps working unchanged — `title`,
 * `description`, `actions`, `className` and `actionsClassName` behave exactly as
 * before, and everything below is opt-in.
 *
 * What Phase 11 added, and why:
 *
 *  1. `eyebrow` — a small gold context label. A merchant landing mid-workspace
 *     had no cue which part of the product they were in.
 *  2. `meta` — inline hairline-separated facts under the title. Pages whose only
 *     numbers were "3 / label" were spending a whole KPI band on them; this
 *     keeps the fact and gives the band back.
 *  3. `secondary` vs `actions` — a ranked split. With one undifferentiated
 *     cluster a search box rendered with the same weight as the page's primary
 *     affordance. `secondary` renders first and quiet, `actions` last and
 *     primary. Passing only `actions` is still valid and unchanged.
 *  4. `status` — a chip beside the title (live badge, connection state).
 *  5. `divider` — the hairline most call sites were drawing with their own
 *     wrapper `<div className="border-b ...">`.
 *
 * RESPONSIVE (fixed in Phase 11): this used to be `flex items-start
 * justify-between` at every width, which is why `actionsClassName` exists as a
 * manual escape hatch. Verified at 768px on /dashboard/customers: a wide action
 * cluster (search form + export + import + primary) squeezed the title column
 * until `.page-desc` wrapped one word per line. It now stacks until `lg`, so a
 * tablet gets a full-width title block OR a full-width toolbar rather than both.
 * `actionsClassName` still works and is now redundant rather than load-bearing.
 *
 * RTL: logical properties throughout (`text-start`, `ms-`/`me-`), so the
 * composition mirrors natively without a direction branch.
 */
interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /**
   * Override the actions wrapper's classes. Retained for the call sites that
   * pass it; the responsive stacking above means it is no longer required to
   * prevent narrow-screen overflow.
   */
  actionsClassName?: string;
  /** Small gold context label above the title (workspace, section, state). */
  eyebrow?: React.ReactNode;
  /** Inline hairline-separated facts (counts, last-updated, status). */
  meta?: React.ReactNode[];
  /** Quiet controls — search, filters, export, refresh. Rendered before `actions`. */
  secondary?: React.ReactNode;
  /** Status chip rendered beside the title (live badge, connection state). */
  status?: React.ReactNode;
  /** Hairline under the header. Off by default — call sites that already wrap
   *  themselves in a bordered container keep their existing look. */
  divider?: boolean;
}

function PageHeader({
  title,
  description,
  actions,
  className,
  actionsClassName,
  eyebrow,
  meta,
  secondary,
  status,
  divider = false,
}: PageHeaderProps) {
  const facts = (meta || []).filter(Boolean);

  return (
    <div
      className={cn(
        "flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between",
        divider && "border-b border-white/[0.06] pb-5",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="page-title">{title}</h1>
          {status}
        </div>
        {description && <p className="page-desc mt-2">{description}</p>}
        {facts.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-slate-400">
            {facts.map((f, i) => (
              <span key={i} className="flex items-center gap-3">
                {i > 0 && <span aria-hidden className="h-3 w-px bg-white/[0.10]" />}
                <span className="flex items-center gap-1.5">{f}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {(actions || secondary) && (
        <div className={cn("flex shrink-0 flex-wrap items-center gap-2", actionsClassName)}>
          {secondary}
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * A single fact for `PageHeader.meta` — a quiet label with an emphasised value.
 * Keeps numbers legible without promoting them to a KPI card.
 */
function HeaderFact({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "positive" | "warning" | "danger";
}) {
  const toneClass =
    tone === "positive"
      ? "text-brand-300"
      : tone === "warning"
        ? "text-amber-300"
        : tone === "danger"
          ? "text-rose-300"
          : "text-slate-200";
  return (
    <>
      <span className={cn("font-semibold tabular-nums", toneClass)}>{value}</span>
      <span className="text-slate-500">{label}</span>
    </>
  );
}

export { PageHeader, HeaderFact };
