"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type LimelightTab = {
  key: string;
  label: string;
  href?: string;
  count?: number;
  countClass?: string;
};

interface LimelightTabsProps {
  tabs: LimelightTab[];
  activeKey: string;
  onChange?: (key: string) => void;
  className?: string;
}

/**
 * 21st.dev "limelight" navigation — a pill row with a glowing indicator that
 * slides under the active item (a cone of light drops from a bright bar). Adapted
 * to KEYONE's emerald token, RTL-aware (measures offsetLeft so it works in both
 * directions), and usable either as links (href) or buttons (onChange).
 */
export function LimelightTabs({ tabs, activeKey, onChange, className }: LimelightTabsProps) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.key === activeKey));

  useLayoutEffect(() => {
    const el = refs.current[activeIndex];
    if (el) setBox({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeIndex, tabs.length]);

  return (
    <div
      className={cn(
        "relative inline-flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1",
        className,
      )}
    >
      {/* sliding limelight indicator */}
      {box && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-1 bottom-1 z-0 rounded-lg bg-gradient-to-b from-brand-500/25 to-brand-600/10 ring-1 ring-inset ring-brand-400/30 transition-all duration-300 ease-premium"
          style={{ left: box.left, width: box.width }}
        >
          <span className="absolute inset-x-3 -top-px h-px bg-gradient-to-r from-transparent via-brand-300/80 to-transparent" />
        </div>
      )}

      {tabs.map((t, i) => {
        const active = t.key === activeKey;
        const inner = (
          <>
            <span>{t.label}</span>
            {t.count !== undefined && (
              <span className={cn("tabular-nums", active ? "text-white" : t.countClass || "text-slate-500")}>
                {t.count}
              </span>
            )}
          </>
        );
        const cls = cn(
          "relative z-10 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-200",
          active ? "text-white" : "text-slate-400 hover:text-slate-200",
        );
        return t.href ? (
          <Link
            key={t.key}
            ref={(el) => { refs.current[i] = el; }}
            href={t.href}
            className={cls}
          >
            {inner}
          </Link>
        ) : (
          <button
            key={t.key}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            onClick={() => onChange?.(t.key)}
            className={cls}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
