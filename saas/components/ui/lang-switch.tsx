"use client";

import { useCallback } from "react";
import type { Locale } from "@/lib/i18n";

export default function LangSwitch({ current }: { current: Locale }) {
  const toggle = useCallback(() => {
    const next: Locale = current === "ar" ? "en" : "ar";
    const url = new URL(window.location.href);
    if (next === "ar") {
      url.searchParams.delete("lang");
    } else {
      url.searchParams.set("lang", "en");
    }
    // Save preference in cookie for 1 year
    document.cookie = `keyone_locale=${next};path=/;max-age=31536000;samesite=lax`;
    window.location.href = url.toString();
  }, [current]);

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-lg border border-white/[0.1] bg-transparent px-3 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      aria-label={current === "ar" ? "Switch to English" : "التبديل للعربية"}
    >
      <span className="text-[10px] leading-none opacity-70">
        {current === "ar" ? "EN" : "عر"}
      </span>
      <span>{current === "ar" ? "English" : "العربية"}</span>
    </button>
  );
}
