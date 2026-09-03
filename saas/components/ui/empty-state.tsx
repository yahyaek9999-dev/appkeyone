import { cn } from "@/lib/utils";

/**
 * EmptyState — two distinct compositions, because "empty" means two things.
 *
 * Evidence (Phase 11, 74-screenshot sweep): ~25 of the 74 screenshots were the
 * *same picture* — a page title, then one bordered rectangle holding a 56px
 * icon badge, a heading, and one grey line, occupying the top third of the
 * viewport with the remaining two thirds pure black. It told a first-time
 * merchant that something was missing but never why it mattered or what to do,
 * and the giant centred icon badge is the most recognisable AI-template tell
 * in the product.
 *
 * The fix separates the two jobs:
 *
 *  • variant="page"   — this IS the screen. An activation composition:
 *                       what's empty → why it matters → the first action →
 *                       concrete next steps. Start-aligned (reads as designed
 *                       content, not a placeholder), carries its own quiet
 *                       surface, and is proportioned to actually occupy the
 *                       canvas instead of floating in it.
 *
 *  • variant="inline" — a section inside a populated screen came back empty
 *                       (default; keeps every existing call site working).
 *                       Same idea, dialled right down: small quiet glyph,
 *                       centred, no borders of its own.
 *
 * RTL: logical properties throughout, so both variants mirror natively.
 */
export interface EmptyStateStep {
  /** Short imperative — "اربط واتساب", "أضف أول منتج". */
  title: string;
  /** One line on what this step actually does. */
  body?: string;
}

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Why this matters — the sentence the old empty states never had. */
  hint?: React.ReactNode;
  /** The one thing to do next. */
  action?: React.ReactNode;
  /** An escape hatch — import, docs, skip. Never competes with `action`. */
  secondaryAction?: React.ReactNode;
  /** 2–3 concrete next steps. Renders as a hairline-separated strip. */
  steps?: EmptyStateStep[];
  /** "page" = the screen's primary surface. "inline" = a section within one. */
  variant?: "page" | "inline";
  /**
   * "activation" (default) — something is missing and the merchant should act.
   * "clear"                — zero is the GOOD answer (no escalations waiting,
   *                          no anomalies, no churn risk). These must read as
   *                          confirmation, not as a nag: a queue at zero is a
   *                          well-run business, and dressing it up with a CTA
   *                          teaches merchants to distrust the signal.
   */
  tone?: "activation" | "clear";
  size?: "sm" | "md" | "lg";
}

const INLINE_SIZE = {
  sm: { wrap: "py-8 gap-2.5", icon: "size-4", title: "text-[13px]", desc: "text-xs", max: "max-w-xs" },
  md: { wrap: "py-12 gap-3", icon: "size-[18px]", title: "text-[15px]", desc: "text-[13px]", max: "max-w-sm" },
  lg: { wrap: "py-16 gap-3.5", icon: "size-5", title: "text-base", desc: "text-[13px]", max: "max-w-md" },
};

export function EmptyState({
  icon,
  title,
  description,
  hint,
  action,
  secondaryAction,
  steps,
  variant = "inline",
  tone = "activation",
  size = "md",
  className,
  ...props
}: EmptyStateProps) {
  if (variant === "page") {
    return (
      <div
        className={cn(
          // Its own quiet surface — a hairline and a barely-there fill, not the
          // heavy `.card` treatment that made every one of these read as a box.
          "relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.012]",
          // Proportioned to the canvas: the old states were ~180px tall inside
          // a ~760px content column, which is what produced the black void.
          // A "clear" state is deliberately shorter — it is good news, and good
          // news does not need to command the screen.
          "flex flex-col justify-center px-6 py-12 sm:px-10 sm:py-14",
          tone === "clear"
            ? "min-h-[clamp(200px,26vh,300px)]"
            : "min-h-[clamp(320px,42vh,460px)]",
          className,
        )}
        {...props}
      >
        {/* One soft emerald wash anchored to the start corner. Gives the
            surface a direction so it doesn't read as a flat empty rectangle —
            no blobs, no glow ring, no gradient border. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 -z-0",
            tone === "clear"
              ? "opacity-[0.4] bg-[radial-gradient(120%_100%_at_100%_0%,rgba(12,122,108,0.14),transparent_58%)]"
              : "opacity-[0.55] bg-[radial-gradient(120%_100%_at_100%_0%,rgba(12,122,108,0.10),transparent_58%)]",
          )}
        />

        <div className="relative z-10 max-w-[54ch]">
          {icon && (
            <span
              className={cn(
                "mb-4 inline-flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset",
                tone === "clear"
                  ? "bg-brand-500/10 text-brand-300 ring-brand-400/20"
                  : "bg-white/[0.04] text-slate-400 ring-white/[0.06]",
              )}
            >
              <span className="size-[18px]">{icon}</span>
            </span>
          )}

          <h3 className="text-[19px] font-semibold leading-snug tracking-[-0.015em] text-white sm:text-[21px]">
            {title}
          </h3>

          {description && (
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-slate-400">{description}</p>
          )}

          {hint && (
            <p className="mt-3 flex items-start gap-2 text-[13px] leading-relaxed text-slate-300">
              <span
                aria-hidden
                className={cn(
                  "mt-[7px] h-1 w-1 shrink-0 rounded-full",
                  tone === "clear" ? "bg-brand-400/70" : "bg-gold-400/70",
                )}
              />
              <span>{hint}</span>
            </p>
          )}

          {(action || secondaryAction) && (
            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              {action}
              {secondaryAction}
            </div>
          )}
        </div>

        {steps && steps.length > 0 && (
          /* Same strip, two readings. On an activation state these are ordered
             steps, so they're numbered. On a "clear" state numbering would be
             wrong — there is nothing to do — so the same slots carry the rules
             that govern the page instead ("this is what lands here, and when").
             That answers the real question behind an empty queue: is it empty
             because it's working, or because it's broken? */
          <ol
            className={cn(
              "relative z-10 grid gap-px overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.05] sm:grid-cols-3",
              tone === "clear" ? "mt-7" : "mt-9",
            )}
          >
            {steps.map((s, i) => (
              <li key={i} className="bg-canvas-deep px-4 py-3.5">
                <div className="flex items-center gap-2">
                  {tone === "clear" ? (
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400/60"
                    />
                  ) : (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md
                                     bg-white/[0.05] text-[11px] font-semibold tabular-nums text-slate-400">
                      {i + 1}
                    </span>
                  )}
                  <span className="text-[13px] font-medium text-slate-200">{s.title}</span>
                </div>
                {s.body && (
                  <p
                    className={cn(
                      "mt-1.5 text-[12px] leading-relaxed text-slate-500",
                      tone === "clear" ? "ps-3.5" : "ps-7",
                    )}
                  >
                    {s.body}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  // ── inline ────────────────────────────────────────────────────────────────
  const s = INLINE_SIZE[size];
  return (
    <div
      className={cn("flex w-full flex-col items-center justify-center px-6 text-center", s.wrap, className)}
      {...props}
    >
      {icon && (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.035]
                         text-slate-500 ring-1 ring-inset ring-white/[0.06]">
          <span className={s.icon}>{icon}</span>
        </span>
      )}
      <div className={cn("space-y-1.5", s.max)}>
        <h3 className={cn("font-semibold tracking-[-0.01em] text-white", s.title)}>{title}</h3>
        {description && <p className={cn("leading-relaxed text-slate-400", s.desc)}>{description}</p>}
        {hint && <p className="text-[12px] leading-relaxed text-slate-500">{hint}</p>}
      </div>
      {(action || secondaryAction) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
