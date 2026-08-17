"use client";

/**
 * Interactive feature comparison matrix with a sticky plan header.
 * - Desktop: full grid, capabilities grouped by category, sticky header row.
 * - Mobile: per-category accordion + horizontal scroll of plan columns.
 * Reads the canonical capability ladder straight from the pricing catalog.
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
  "scale",
  "enterprise",
];

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
  const [openCat, setOpenCat] = useState<CapabilityCategory | null>("core");

  const Cell = ({ on }: { on: boolean }) =>
    on ? (
      <Check className="mx-auto h-4 w-4 text-brand-400" />
    ) : (
      <Minus className="mx-auto h-4 w-4 text-slate-700" />
    );

  return (
    <div>
      <div className="mb-8 text-center">
        <h2 className="display-heading text-3xl sm:text-4xl">{title}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">{subtitle}</p>
      </div>

      {/* ───────── Desktop / tablet table ───────── */}
      <div className="hidden overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl md:block">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-canvas-raised/95 backdrop-blur-xl">
              <th className="p-4 text-start text-xs font-medium uppercase tracking-wider text-slate-500">
                {locale === "ar" ? "الميزة" : "Feature"}
              </th>
              {PUBLIC_TIERS.map((t) => (
                <th key={t.slug} className="p-4 text-center">
                  <div
                    className={`text-sm font-bold ${
                      t.recommended ? "text-brand-300" : "text-white"
                    }`}
                  >
                    {t.name[lang].replace("KEYONE ", "")}
                  </div>
                  <div className="mt-0.5 text-[11px] font-normal text-slate-500">
                    {t.contactSales
                      ? locale === "ar"
                        ? "مخصّص"
                        : "Custom"
                      : `$${t.priceUsdMonthly}`}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORY_ORDER.map((cat) => {
              const caps = CAPABILITIES.filter((c) => c.category === cat);
              if (!caps.length) return null;
              return (
                <FragmentRows
                  key={cat}
                  catLabel={CATEGORY_LABELS[cat][lang]}
                  caps={caps}
                  lang={lang}
                  comingSoonLabel={comingSoonLabel}
                  Cell={Cell}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ───────── Mobile accordion ───────── */}
      <div className="space-y-3 md:hidden">
        {CATEGORY_ORDER.map((cat) => {
          const caps = CAPABILITIES.filter((c) => c.category === cat);
          if (!caps.length) return null;
          const open = openCat === cat;
          return (
            <div
              key={cat}
              className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
            >
              <button
                onClick={() => setOpenCat(open ? null : cat)}
                className="flex w-full items-center justify-between p-4 text-start"
              >
                <span className="text-sm font-semibold text-white">
                  {CATEGORY_LABELS[cat][lang]}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
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

function FragmentRows({
  catLabel,
  caps,
  lang,
  comingSoonLabel,
  Cell,
}: {
  catLabel: string;
  caps: typeof CAPABILITIES;
  lang: "ar" | "en";
  comingSoonLabel: string;
  Cell: (p: { on: boolean }) => JSX.Element;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={PUBLIC_TIERS.length + 1}
          className="bg-white/[0.03] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-brand-300/80"
        >
          {catLabel}
        </td>
      </tr>
      {caps.map((c) => (
        <tr
          key={c.key}
          className="border-t border-white/[0.05] transition-colors hover:bg-white/[0.02]"
        >
          <td className="p-4 text-start text-slate-300">
            {c.label[lang]}
            {c.comingSoon && (
              <span className="ms-1.5 text-[10px] text-amber-400/80">
                ({comingSoonLabel})
              </span>
            )}
          </td>
          {PUBLIC_TIERS.map((t) => (
            <td
              key={t.slug}
              className={`p-4 ${t.recommended ? "bg-brand-500/[0.04]" : ""}`}
            >
              <Cell on={t.capIndex >= c.minTierIndex} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
