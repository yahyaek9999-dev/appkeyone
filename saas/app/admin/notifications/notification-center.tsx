"use client";

// Renders real attention signals as actionable notifications. Acknowledge/resolve
// is per-admin, persisted in localStorage (no server model for this state). Signals
// themselves are always live from the server — ack only hides them locally.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck, ArrowLeft, RotateCcw } from "lucide-react";

type Signal = {
  id: string;
  domain: string;
  severity: "critical" | "warn" | "info";
  area: string;
  problem: string;
  cta: string;
  href: string;
};

const SEV: Record<string, { cls: string; dot: string; label: string }> = {
  critical: { cls: "border-rose-500/25 bg-rose-500/[0.04]", dot: "bg-rose-500", label: "حرج" },
  warn: { cls: "border-amber-500/25 bg-amber-500/[0.03]", dot: "bg-amber-400", label: "تحذير" },
  info: { cls: "border-white/[0.06] bg-white/[0.02]", dot: "bg-slate-500", label: "معلومة" },
};

const LS_KEY = "keyone_admin_notif_state";

type State = Record<string, "ack" | "resolved">;

function loadState(): State {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
function saveState(s: State) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

export default function NotificationCenter({ signals }: { signals: Signal[] }) {
  const [state, setState] = useState<State>({});
  const [filter, setFilter] = useState<"unread" | "acknowledged" | "resolved" | "all">("unread");

  useEffect(() => { setState(loadState()); }, []);

  function setStatus(id: string, status: "ack" | "resolved" | null) {
    setState((prev) => {
      const next = { ...prev };
      if (status) next[id] = status; else delete next[id];
      saveState(next);
      return next;
    });
  }

  const visible = useMemo(() => {
    return signals.filter((s) => {
      const st = state[s.id];
      if (filter === "all") return true;
      if (filter === "unread") return !st;
      if (filter === "acknowledged") return st === "ack";
      if (filter === "resolved") return st === "resolved";
      return true;
    });
  }, [signals, state, filter]);

  const unread = signals.filter((s) => !state[s.id]).length;

  const TABS: { key: typeof filter; label: string }[] = [
    { key: "unread", label: `غير مقروء (${unread})` },
    { key: "acknowledged", label: "مُستلَمة" },
    { key: "resolved", label: "مُعالَجة" },
    { key: "all", label: "الكل" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`rounded-full px-3 py-1 text-sm transition ${filter === t.key ? "bg-brand-500/20 text-brand-200" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6">
          <CheckCheck className="h-8 w-8 shrink-0 text-emerald-400" />
          <div className="text-sm text-slate-300">
            {filter === "unread" ? "لا إشعارات غير مقروءة — كل شيء تحت السيطرة." : "لا عناصر في هذا التصنيف."}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((s) => {
            const sev = SEV[s.severity];
            const st = state[s.id];
            return (
              <div key={s.id} className={`flex items-center gap-3 rounded-xl border p-4 ${sev.cls} ${st === "resolved" ? "opacity-60" : ""}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${sev.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Bell className="h-3.5 w-3.5 text-slate-500" />
                    <span className="text-[11px] text-slate-500">{s.area}</span>
                    <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-slate-400">{sev.label}</span>
                  </div>
                  <div className="mt-0.5 text-sm font-medium text-white">{s.problem}</div>
                </div>
                <Link href={s.href} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-white/[0.16] hover:bg-white/[0.08]">
                  {s.cta} <ArrowLeft className="h-3 w-3" />
                </Link>
                {st !== "ack" && st !== "resolved" && (
                  <button onClick={() => setStatus(s.id, "ack")} title="استلام" className="shrink-0 rounded-lg border border-white/[0.08] p-1.5 text-slate-400 hover:text-white">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}
                {st !== "resolved" && (
                  <button onClick={() => setStatus(s.id, "resolved")} title="معالجة" className="shrink-0 rounded-lg border border-white/[0.08] p-1.5 text-emerald-400 hover:text-emerald-300">
                    <CheckCheck className="h-3.5 w-3.5" />
                  </button>
                )}
                {st && (
                  <button onClick={() => setStatus(s.id, null)} title="إعادة" className="shrink-0 rounded-lg border border-white/[0.08] p-1.5 text-slate-500 hover:text-white">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-slate-500">
        الإشارات حيّة من الخادم دائماً؛ حالة «مُستلَمة/مُعالَجة» محفوظة محلياً لكل مشرف (لا يوجد نموذج خادم لهذه الحالة).
      </p>
    </div>
  );
}
