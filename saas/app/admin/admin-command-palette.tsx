"use client";

// Global Admin Search — Cmd/Ctrl+K. Server-side, RBAC-gated results from
// /api/admin/search, grouped, keyboard-navigable. Mounted once in the admin
// layout so it is reachable from every admin page.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, CornerDownLeft } from "lucide-react";

type SearchHit = { id: string; title: string; subtitle?: string; href: string };
type SearchGroup = { key: string; label: string; hits: SearchHit[] };

export default function AdminCommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Flatten hits for keyboard navigation.
  const flat: SearchHit[] = groups.flatMap((g) => g.hits);

  // Open/close on Cmd/Ctrl+K, close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else {
      setQ("");
      setGroups([]);
      setActive(0);
    }
  }, [open]);

  // Debounced server search.
  useEffect(() => {
    if (q.trim().length < 2) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/search?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
        const j = await r.json();
        setGroups(Array.isArray(j.groups) ? j.groups : []);
        setActive(0);
      } catch {
        setGroups([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const go = useCallback(
    (hit?: SearchHit) => {
      const target = hit || flat[active];
      if (!target) return;
      setOpen(false);
      router.push(target.href);
    },
    [flat, active, router],
  );

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go();
    }
  }

  if (!open) return null;

  let flatIndex = -1;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/60 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.10] bg-[#0f1720] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="ابحث عن تاجر، باقة، ميزة، حادثة، أو طلب…"
            className="w-full bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none"
          />
          {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-500" />}
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {q.trim().length < 2 && <div className="px-3 py-6 text-center text-[12px] text-slate-600">اكتب حرفين على الأقل للبحث</div>}
          {q.trim().length >= 2 && !loading && flat.length === 0 && (
            <div className="px-3 py-6 text-center text-[12px] text-slate-600">لا نتائج لـ «{q}»</div>
          )}
          {groups.map((g) => (
            <div key={g.key} className="mb-1">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{g.label}</div>
              {g.hits.map((hit) => {
                flatIndex++;
                const isActive = flatIndex === active;
                return (
                  <button
                    key={g.key + hit.id}
                    onMouseEnter={() => setActive(flat.indexOf(hit))}
                    onClick={() => go(hit)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right transition ${isActive ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-white">{hit.title}</div>
                      {hit.subtitle && <div className="truncate text-[11px] text-slate-500">{hit.subtitle}</div>}
                    </div>
                    {isActive && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2 text-[10px] text-slate-600">
          <span>↑↓ للتنقل · Enter للفتح · Esc للإغلاق</span>
          <span>بحث المشرف</span>
        </div>
      </div>
    </div>
  );
}
