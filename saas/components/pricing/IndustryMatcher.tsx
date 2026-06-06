"use client";

/**
 * Industry-matching system. Pick an industry + maturity level and the matching
 * KEYONE tier is highlighted with a rationale. Also renders the full visual
 * mapping grid (industry × level → tier). Reads INDUSTRIES + TIERS from config.
 */

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { INDUSTRIES } from "@/lib/pricing/industries";
import { getTier, TIERS } from "@/lib/pricing/catalog";

export default function IndustryMatcher({
  locale = "ar",
  title,
  subtitle,
  resultPrefix,
  levelLabels,
}: {
  locale?: "ar" | "en";
  title: string;
  subtitle: string;
  resultPrefix: string; // "We recommend"
  levelLabels: [string, string, string]; // Startup / Growth / Elite headers
}) {
  const lang = locale === "ar" ? "ar" : "en";
  const isRtl = locale === "ar";
  const Arrow = isRtl ? ArrowLeft : ArrowRight;

  const [industryKey, setIndustryKey] = useState(INDUSTRIES[0].key);
  const [levelIdx, setLevelIdx] = useState(0);

  const industry = INDUSTRIES.find((i) => i.key === industryKey) ?? INDUSTRIES[0];
  const level = industry.levels[levelIdx];
  const tier = getTier(level.tier);

  return (
    <div>
      <div className="mb-8 text-center">
        <h2 className="display-heading text-3xl sm:text-4xl">{title}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">{subtitle}</p>
      </div>

      {/* ───────── Interactive picker ───────── */}
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl sm:p-7">
        {/* Industry chips */}
        <div className="mb-5 flex flex-wrap justify-center gap-2">
          {INDUSTRIES.map((i) => {
            const active = i.key === industryKey;
            return (
              <button
                key={i.key}
                onClick={() => {
                  setIndustryKey(i.key);
                  setLevelIdx(0);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? "border-brand-500/50 bg-brand-500/15 text-white"
                    : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-200"
                }`}
              >
                <span>{i.icon}</span>
                {i.label[lang]}
              </button>
            );
          })}
        </div>

        {/* Level segmented control */}
        <div className="mx-auto mb-6 grid max-w-md grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1">
          {industry.levels.map((lv, idx) => {
            const active = idx === levelIdx;
            return (
              <button
                key={lv.key}
                onClick={() => setLevelIdx(idx)}
                className={`rounded-lg px-2 py-2 text-xs font-medium transition-all ${
                  active
                    ? "bg-brand-500 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {levelLabels[idx]}
              </button>
            );
          })}
        </div>

        {/* Result */}
        <div className="flex flex-col items-center gap-3 rounded-xl border border-brand-500/30 bg-gradient-to-b from-brand-500/[0.1] to-transparent p-5 text-center">
          <div className="text-xs uppercase tracking-wider text-slate-400">
            {resultPrefix}
          </div>
          <div className="text-2xl font-bold text-white">
            {tier?.name[lang] ?? level.tier}
          </div>
          <p className="max-w-md text-sm text-slate-300">{level.why[lang]}</p>
          <a
            href="#plans"
            className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-brand-300 transition hover:text-brand-200"
          >
            {locale === "ar" ? "اعرض الباقة" : "View plan"}
            <Arrow className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* ───────── Full visual mapping grid ───────── */}
      <div className="mt-10 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="bg-canvas-raised/95">
              <th className="p-4 text-start text-xs font-medium uppercase tracking-wider text-slate-500">
                {locale === "ar" ? "القطاع" : "Industry"}
              </th>
              {levelLabels.map((l) => (
                <th
                  key={l}
                  className="p-4 text-center text-xs font-medium uppercase tracking-wider text-slate-500"
                >
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INDUSTRIES.map((i) => (
              <tr
                key={i.key}
                className="border-t border-white/[0.05] transition-colors hover:bg-white/[0.02]"
              >
                <td className="p-4 text-start font-medium text-slate-300">
                  <span className="me-1.5">{i.icon}</span>
                  {i.label[lang]}
                </td>
                {i.levels.map((lv) => {
                  const t = getTier(lv.tier);
                  const recommended = t?.recommended;
                  return (
                    <td key={lv.key} className="p-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          recommended
                            ? "bg-brand-500/20 text-brand-200"
                            : "bg-white/[0.04] text-slate-300"
                        }`}
                      >
                        {recommended && <Check className="h-3 w-3" />}
                        {t?.name[lang].replace("KEYONE ", "") ?? lv.tier}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
