"use client";

// Saved Admin Views — reusable across Admin tables.
//
// Persists {name, params} sets per table in localStorage (no schema change, no
// server model, no secrets). `params` is a plain filter-state object owned by the
// host table; this component just snapshots and re-applies it. The host passes
// its current params and an `onApply(params)` callback.

import { useEffect, useState } from "react";
import { Bookmark, BookmarkPlus, X, Check } from "lucide-react";

export type SavedView<T> = { name: string; params: T };

function keyFor(tableId: string) {
  return `keyone_admin_views__${tableId}`;
}

export default function SavedViews<T>({
  tableId,
  current,
  onApply,
}: {
  tableId: string;
  current: T;
  onApply: (params: T) => void;
}) {
  const [views, setViews] = useState<SavedView<T>[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(keyFor(tableId));
      if (raw) setViews(JSON.parse(raw));
    } catch {}
  }, [tableId]);

  function persist(next: SavedView<T>[]) {
    setViews(next);
    try { localStorage.setItem(keyFor(tableId), JSON.stringify(next)); } catch {}
  }

  function save() {
    const n = name.trim();
    if (!n) return;
    const next = [...views.filter((v) => v.name !== n), { name: n, params: current }];
    persist(next);
    setName("");
    setAdding(false);
  }

  function remove(n: string) {
    persist(views.filter((v) => v.name !== n));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
        <Bookmark className="h-3.5 w-3.5" /> عروض محفوظة:
      </span>
      {views.length === 0 && <span className="text-[11px] text-slate-600">لا يوجد بعد</span>}
      {views.map((v) => (
        <span key={v.name} className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] py-1 pe-1 ps-2.5 text-[12px]">
          <button onClick={() => onApply(v.params)} className="text-slate-200 hover:text-brand-300">{v.name}</button>
          <button onClick={() => remove(v.name)} className="rounded p-0.5 text-slate-600 hover:text-rose-300" title="حذف">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setAdding(false); }}
            placeholder="اسم العرض…"
            className="w-32 rounded-lg border border-white/[0.10] bg-white/[0.04] px-2 py-1 text-[12px] text-white focus:outline-none"
          />
          <button onClick={save} className="rounded-lg border border-brand-500/30 bg-brand-500/20 p-1 text-brand-300"><Check className="h-3.5 w-3.5" /></button>
        </span>
      ) : (
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-[12px] text-slate-400 hover:text-white">
          <BookmarkPlus className="h-3.5 w-3.5" /> احفظ العرض الحالي
        </button>
      )}
    </div>
  );
}
