import { cn } from "@/lib/utils";

/**
 * MetricBand — one connected surface of facts, with one of them ranked.
 *
 * Evidence (Phase 11, 74-screenshot sweep): 13 routes opened with a row of
 * 3–5 bordered rectangles, each holding a large number over a small label, all
 * rendered at identical weight. Two problems compound: (a) N separate borders
 * shred the canvas into a strip of boxes with no relationship, and (b) with
 * everything at equal weight the merchant has no idea which number is the one
 * that matters — the eye lands nowhere, so the whole band gets skipped.
 *
 * This renders the same facts as ONE surface with hairline dividers, and lets
 * exactly one cell be the `anchor`: bigger, brighter, with room for a sentence
 * of context. Everything else drops to secondary weight and becomes reference
 * rather than headline. Scanning cost goes from "read five, rank them yourself"
 * to "read one, glance at the rest".
 *
 * Deliberately NOT a KPI factory: if a page has no meaningful headline metric,
 * pass no anchor and the band renders as a calm, evenly-weighted reference row
 * — which is the honest presentation. Never invent an anchor.
 *
 * RTL: CSS grid + logical properties, mirrors natively.
 */
export interface MetricBandProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Columns at ≥lg. Below that the band reflows to 2-up, then stacks. */
  cols?: 2 | 3 | 4 | 5;
}

const COLS: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-2 lg:grid-cols-5",
};

export function MetricBand({ cols = 4, className, children, ...props }: MetricBandProps) {
  return (
    <div
      className={cn(
        // gap-px over a light fill = hairline dividers between cells, one
        // border around the whole thing. Replaces N independent card borders.
        "grid gap-px overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.055]",
        COLS[cols],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface MetricProps {
  label: string;
  value: React.ReactNode;
  /** One short line of context — trend, comparison, or what the number means. */
  hint?: React.ReactNode;
  /** Small leading glyph. Kept quiet; it labels, it doesn't decorate. */
  icon?: React.ReactNode;
  /**
   * Ranks this cell as the band's headline. Use on at most one cell, and only
   * when a metric genuinely leads the page.
   */
  anchor?: boolean;
  tone?: "default" | "positive" | "warning" | "danger" | "premium";
  /** Makes the whole cell a target (e.g. drilling into the underlying list). */
  href?: string;
  className?: string;
}

const VALUE_TONE: Record<string, string> = {
  default: "text-white",
  positive: "text-brand-300",
  warning: "text-amber-300",
  danger: "text-rose-300",
  premium: "text-gold-300",
};

export function Metric({
  label,
  value,
  hint,
  icon,
  anchor = false,
  tone = "default",
  href,
  className,
}: MetricProps) {
  const Tag: any = href ? "a" : "div";
  return (
    <Tag
      href={href}
      className={cn(
        "relative flex flex-col justify-between bg-canvas-deep transition-colors",
        anchor ? "p-5 sm:col-span-2 lg:col-span-2" : "p-4",
        href && "hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/50 focus-visible:ring-inset",
        className,
      )}
    >
      {/* The anchor earns a start-edge rule instead of a different border or a
          glow — it reads as rank, not as decoration. */}
      {anchor && (
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 start-0 w-[2px]",
            tone === "premium" ? "bg-gold-500/60" : "bg-brand-400/60",
          )}
        />
      )}

      <div className="flex items-center gap-2">
        {icon && <span className="size-3.5 shrink-0 text-slate-500">{icon}</span>}
        <span
          className={cn(
            "font-medium text-slate-400",
            anchor ? "text-[12px]" : "text-[11px]",
          )}
        >
          {label}
        </span>
      </div>

      <div
        className={cn(
          "mt-2 font-semibold tabular-nums tracking-[-0.02em]",
          anchor ? "text-[30px] leading-none sm:text-[34px]" : "text-[19px] leading-none",
          VALUE_TONE[tone],
        )}
      >
        {value}
      </div>

      {hint && (
        <div
          className={cn(
            "mt-2 leading-relaxed text-slate-500",
            anchor ? "text-[12px]" : "text-[11px]",
          )}
        >
          {hint}
        </div>
      )}
    </Tag>
  );
}
