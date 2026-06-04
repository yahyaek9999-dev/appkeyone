"use client";

import { Search } from "lucide-react";

/**
 * Lean sidebar button that opens the ⌘K command palette. The palette listens
 * for the ⌘K/Ctrl+K keydown globally, so this trigger simply synthesises that
 * event — keeping a single source of truth for open/close in CommandPalette.
 */
export default function CommandTrigger() {
  function open() {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true, bubbles: true }),
    );
  }
  return (
    <button
      onClick={open}
      className="flex w-full items-center gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-[13px] text-slate-400 transition-colors hover:border-white/[0.12] hover:bg-white/[0.04] hover:text-slate-200"
    >
      <Search className="h-4 w-4 shrink-0 text-slate-500" />
      <span className="flex-1 text-start">بحث سريع…</span>
      <kbd className="hidden shrink-0 rounded border border-white/[0.1] bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium text-slate-500 sm:block">
        ⌘K
      </kbd>
    </button>
  );
}
