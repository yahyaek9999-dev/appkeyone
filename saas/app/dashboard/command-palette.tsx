"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Role } from "@/lib/rbac";
import { visibleNavItems, type NavMode } from "./nav-items";

/**
 * ⌘K / Ctrl+K command palette — the primary navigation surface for power users
 * and the reason the sidebar can stay lean. Searches every destination the
 * current role can reach. RTL-aware (uses logical properties + dir inherited
 * from <html dir="rtl">). No external dependency — plain React + lucide.
 */
export default function CommandPalette({ role = "owner", activated = true, metaMode = "qr" }: { role?: Role; activated?: boolean; metaMode?: NavMode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Same visibility rules as the sidebar: role + activation + Meta/QR mode.
  const items = useMemo(() => visibleNavItems(role, { activated, metaMode }), [role, activated, metaMode]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((n) => n.label.toLowerCase().includes(q) || n.href.toLowerCase().includes(q));
  }, [items, query]);

  // Global hotkey: ⌘K / Ctrl+K toggles; "/" opens when not typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (!open && k === "/" ) {
        const el = document.activeElement;
        const typing =
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          (el as HTMLElement)?.isContentEditable;
        if (!typing) {
          e.preventDefault();
          setOpen(true);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Reset + focus on open.
  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      // Defer focus to next frame so the element is mounted.
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[cursor];
      if (item) go(item.href);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[14vh]"
      role="dialog"
      aria-modal="true"
      aria-label="لوحة الأوامر"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-white/[0.09] bg-canvas-raised shadow-float"
        onKeyDown={onListKey}
      >
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-4">
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن صفحة أو إجراء…"
            className="h-12 w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-white/[0.1] bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium text-slate-500 sm:block">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-slate-500">
              لا توجد نتائج لـ &quot;{query}&quot;
            </div>
          ) : (
            results.map((n, i) => {
              const Icon = n.icon;
              const active = i === cursor;
              return (
                <button
                  key={n.href}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(n.href)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm transition-colors",
                    active ? "bg-white/[0.06] text-white" : "text-slate-300 hover:bg-white/[0.03]",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", active ? "text-brand-300" : "text-slate-500")} />
                  <span className="flex-1 truncate">{n.label}</span>
                  {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
