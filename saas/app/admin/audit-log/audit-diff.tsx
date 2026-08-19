"use client";

// Renders a compact Before → After diff for an audit row whose metadata carries
// structured { before, after } (written by Batch 2 sensitive mutations). Rows
// without that shape show a dash — this never fabricates a diff for opaque data.

import { useState } from "react";
import { ArrowLeft, GitCompare } from "lucide-react";

function coerce(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

export default function AuditDiff({ metadata }: { metadata: string }) {
  const [open, setOpen] = useState(false);

  let before: Record<string, unknown> | null = null;
  let after: Record<string, unknown> | null = null;
  try {
    const m = JSON.parse(metadata || "{}");
    if (m && typeof m === "object" && (m.before || m.after)) {
      before = (m.before as Record<string, unknown>) || {};
      after = (m.after as Record<string, unknown>) || {};
    }
  } catch {
    // not structured — no diff
  }

  if (!before && !after) return <span className="text-slate-600">—</span>;

  const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]));

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-300 hover:border-white/[0.16] hover:text-white"
      >
        <GitCompare className="h-3 w-3" />
        {open ? "إخفاء" : "التغيير"}
      </button>
      {open && (
        <div className="mt-2 space-y-1 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2">
          {keys.map((k) => {
            const b = coerce(before?.[k]);
            const a = coerce(after?.[k]);
            const changed = b !== a;
            return (
              <div key={k} className="flex items-center gap-2 text-[11px]">
                <span className="min-w-[90px] shrink-0 text-slate-500">{k}</span>
                <span className={`rounded px-1.5 py-0.5 ${changed ? "bg-rose-500/10 text-rose-300 line-through" : "text-slate-400"}`} dir="ltr">{b}</span>
                <ArrowLeft className="h-3 w-3 shrink-0 text-slate-600" />
                <span className={`rounded px-1.5 py-0.5 ${changed ? "bg-emerald-500/10 text-emerald-300" : "text-slate-400"}`} dir="ltr">{a}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
