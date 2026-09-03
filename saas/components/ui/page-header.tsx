import { cn } from "@/lib/utils";

/**
 * PageHeader — the single composition that opens an operational page.
 *
 * Evidence (Phase 11, 74-screenshot sweep): every dashboard route opened with
 * an ad-hoc `flex justify-between` holding a 22px title, an equally-weighted
 * description, and a primary button parked in the opposite corner. Nothing
 * established what the page was *for*, and the primary action read the same as
 * a search box next to it. Three things are fixed here:
 *
 *  1. TITLE DOMINATES — `.page-title` is now a real display step, and the
 *     description is explicitly subordinate (13px, capped measure).
 *  2. ACTIONS HAVE RANK — `action` is the one primary affordance and always
 *     renders last in DOM order but visually leading; `secondary` holds the
 *     quiet stuff (search, export, refresh) so the two never look equal.
 *  3. NUMBERS BECOME CONTEXT — `meta` renders inline, hairline-separated
 *     facts under the title. Pages that only ever had three
 *     "0 / label" boxes to show should use this instead of a KPI card row;
 *     it keeps the fact without spending a whole band of the canvas on it.
 *
 * RTL: everything is logical-property based (`text-start`, `ms-`/`me-`), so
 * the composition mirrors correctly without a separate branch.
 */
export interface PageHeaderProps {
  /** Small gold context label above the title (workspace, section, state). */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** One sentence. What this page is for — not a restatement of the title. */
  description?: React.ReactNode;
  /** Inline hairline-separated facts (counts, last-updated, status). */
  meta?: React.ReactNode[];
  /** The single primary affordance for this page. */
  action?: React.ReactNode;
  /** Quiet controls — search, filters, export, refresh. */
  secondary?: React.ReactNode;
  /** Status chip rendered beside the title (live badge, connection state). */
  status?: React.ReactNode;
  /** Hairline under the header. On by default; off when a toolbar follows. */
  divider?: boolean;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  action,
  secondary,
  status,
  divider = true,
  className,
}: PageHeaderProps) {
  const facts = (meta || []).filter(Boolean);

  return (
    <header
      className={cn(
        // Stacks until lg. Verified at 768px: going side-by-side at `sm` let a
        // wide action cluster (search + export + import + primary) squeeze the
        // title column until `.page-desc` wrapped one word per line. A tablet
        // has room for a full-width title block OR a full-width toolbar, not
        // both — so they stack, and only the desktop column split runs them
        // side by side.
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

      {(action || secondary) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {secondary}
          {action}
        </div>
      )}
    </header>
  );
}

/**
 * A single fact for `PageHeader.meta` — a quiet label with an emphasised value.
 * Keeps numbers legible without promoting them to a KPI card.
 */
export function HeaderFact({
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
