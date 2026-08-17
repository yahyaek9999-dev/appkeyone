"use client";

/**
 * Interactive feature comparison matrix with expandable category sections.
 * - Desktop: sticky plan header + collapsible category rows.
 * - Mobile: full accordion (one category at a time).
 * Reads the canonical capability ladder from the pricing catalog.
 */

import { useState } from "react";
import { Check, Minus, ChevronDown } from "lucide-react";
import {
  CAPABILITIES,
  CATEGORY_LABELS,
  PUBLIC_TIERS,
  type CapabilityCategory,
} from "@/lib/pricing/catalog";

const CATEGORY_ORDER: CapabilityCategory[] = [
  "core",
  "automation",
  "team",
  "intelligence",
  "analytics",
  "commerce",
  "messaging",
  "operations",
  "scale",
  "enterprise",
];

// Categories open by default on desktop
const DEFAULT_OPEN = new Set<CapabilityCategory>(["core", "automation"]);

export default function FeatureMatrix({
  locale = "ar",
  title,
  subtitle,
  comingSoonLabel,
}: {
  locale?: "ar" | "en";
  title: string;
  subtitle: string;
  comingSoonLabel: string;
}) {
  const lang = locale === "ar" ? "ar" : "en";

  // desktop: multiple categories can be open simultaneously
  const [openDesktop, setOpenDesktop] = useState<Set<CapabilityCategory>>(DEFAULT_OPEN);
  // mobile: single open category
  const [openMobile, setOpenMobile] = useState<CapabilityCategory | null>("core");

  function toggleDesktop(cat: CapabilityCategory) {
    setOpenDesktop((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  const Cell = ({ on }: { on: boolean }) =>
    on ? (
      <Check className="mx-auto h-4 w-4 text-brand-400" />
    ) : (
      <Minus className="mx-auto h-4 w-4 text-white/10" />
    );

  const categoriesWithCaps = CATEGORY_ORDER.filter(
    (cat) => CAPABILITIES.filter((c) => c.category === cat).length > 0,
  );

  return (
    <div>
      <div className="mb-10 text-center">
        <h2 className="display-heading text-3xl sm:text-4xl">{title}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">{subtitle}</p>
        <button
          onClick={() =>
            setOpenDesktop(
              openDesktop.size === categoriesWithCaps.length
                ? new Set<CapabilityCategory>(["core"])
                : new Set(categoriesWithCaps),
            )
          }
          className="mt-4 text-xs text-brand-400 hover:text-brand-300 underline underline-offset-2"
        >
          {openDesktop.size === categoriesWithCaps.length
            ? locale === "ar" ? "طيّ الكل" : "Collapse all"
            : locale === "ar" ? "توسيع الكل" : "Expand all"}
        </button>
      </div>

      {/* ───────── Desktop table ───────── */}
      <div className="hidden overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl md:block">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          {/* Sticky header */}
          <thead className="sticky top-0 z-10">
            <tr className="bg-canvas-raised/95 backdrop-blur-xl">
              <th className="w-[38%] p-4 text-start text-xs font-medium uppercase tracking-wider text-slate-500">
                {locale === "ar" ? "الميزة" : "Feature"}
              </th>
              {PUBLIC_TIERS.map((t) => (
                <th key={t.slug} className={`p-4 text-center ${t.recommended ? "bg-brand-500/[0.06]" : ""}`}>
                  <div
                    className={`text-sm font-bold ${
                      t.recommended ? "text-brand-300" : "text-white"
                    }`}
                  >
                    {t.name[lang].replace("KEYONE ", "")}
                  </div>
                  <div className="mt-0.5 text-[11px] font-normal text-slate-500">
                    {t.contactSales
                      ? locale === "ar" ? "مخصّص" : "Custom"
                      : `$${t.priceUsdMonthly}`}
                  </div>
                  {t.recommended && (
                    <div className="mt-1 text-[10px] font-semibold text-brand-400 uppercase tracking-wide">
                      {locale === "ar" ? "الأكثر طلباً" : "Most popular"}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categoriesWithCaps.map((cat) => {
              const caps = CAPABILITIES.filter((c) => c.category === cat);
              const isOpen = openDesktop.has(cat);
              return (
                <>
                  {/* Category header row — always visible, clickable */}
                  <tr
                    key={`cat-${cat}`}
                    className="cursor-pointer select-none border-t border-white/[0.06] hover:bg-white/[0.02]"
                    onClick={() => toggleDesktop(cat)}
                  >
                    <td
                      colSpan={PUBLIC_TIERS.length + 1}
                      className="px-4 py-3"
                    >
                      <div className="flex items-center gap-2">
                        <ChevronDown
                          className={`h-3.5 w-3.5 text-slate-500 transition-transform duration-200 ${
                            isOpen ? "rotate-0" : "-rotate-90"
                          }`}
                        />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-300/80">
                          {CATEGORY_LABELS[cat][lang]}
                        </span>
                        <span className="text-[10px] text-slate-600">
                          ({caps.length})
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Feature rows — visible only when category is open */}
                  {isOpen &&
                    caps.map((c) => (
                      <tr
                        key={c.key}
                        className="border-t border-white/[0.04] transition-colors hover:bg-white/[0.015]"
                      >
                        <td className="py-3 ps-8 pe-4 text-start text-[13px] text-slate-300">
                          {c.label[lang]}
                          {c.comingSoon && (
                            <span className="ms-1.5 text-[10px] text-amber-400/70">
                              ({comingSoonLabel})
                            </span>
                          )}
                        </td>
                        {PUBLIC_TIERS.map((t) => (
                          <td
                            key={t.slug}
                            className={`py-3 text-center ${t.recommended ? "bg-brand-500/[0.03]" : ""}`}
                          >
                            <Cell on={t.capIndex >= c.minTierIndex} />
                          </td>
                        ))}
                      </tr>
                    ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ───────── Mobile accordion ───────── */}
      <div className="space-y-2 md:hidden">
        {categoriesWithCaps.map((cat) => {
          const caps = CAPABILITIES.filter((c) => c.category === cat);
          const open = openMobile === cat;
          return (
            <div
              key={cat}
              className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
            >
              <button
                onClick={() => setOpenMobile(open ? null : cat)}
                className="flex w-full items-center justify-between px-4 py-3 text-start"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">
                    {CATEGORY_LABELS[cat][lang]}
                  </span>
                  <span className="text-[11px] text-slate-600">({caps.length})</span>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                />
              </button>
              {open && (
                <div className="space-y-4 border-t border-white/[0.06] p-4">
                  {caps.map((c) => (
                    <div key={c.key}>
                      <div className="mb-2 text-[13px] text-slate-300">
                        {c.label[lang]}
                        {c.comingSoon && (
                          <span className="ms-1.5 text-[10px] text-amber-400/80">
                            ({comingSoonLabel})
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {PUBLIC_TIERS.map((t) => {
                          const on = t.capIndex >= c.minTierIndex;
                          return (
                            <span
                              key={t.slug}
                              className={`rounded-md px-2 py-0.5 text-[11px] ${
                                on
                                  ? "bg-brand-500/15 text-brand-300"
                                  : "bg-white/[0.03] text-slate-600 line-through"
                              }`}
                            >
                              {t.name[lang].replace("KEYONE ", "")}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
