"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, Play, Bot, User, MessagesSquare, ArrowRight } from "lucide-react";
import Link from "next/link";

type Msg = { turn: number; role: string; content: string; confidence: number };
type Conv = {
  id: string;
  scenarioId: string;
  category: string;
  persona: string;
  turns: number;
  resolutionState: string;
  avgConfidence: number;
  createdAt: string;
  messages: Msg[];
};

const RES: Record<string, { label: string; cls: string }> = {
  resolved: { label: "تم الحل", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  escalated: { label: "تصعيد", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  unresolved: { label: "غير محسوم", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
};

export default function SimulateUi() {
  const [cats, setCats] = useState<{ key: string; label: string }[]>([]);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [category, setCategory] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/arena/conversations", { cache: "no-store" }).then((r) =>
        r.json(),
      );
      if (j.ok) {
        setConvs(j.conversations);
        setCats(j.categories);
        if (!category && j.categories[0]) setCategory(j.categories[0].key);
      }
    } finally {
      setLoading(false);
    }
  }, [category]);
  useEffect(() => {
    load();
  }, []); // eslint-disable-line

  async function run() {
    setRunning(true);
    try {
      await fetch("/api/arena/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(category ? { category } : {}),
      });
      await load();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1">محاكاة المحادثات</h1>
          <p className="text-sm text-slate-400 max-w-xl">
            يحاكي محادثة كاملة: عميل ← مساعد ← عميل ← مساعد، بردود حقيقية من معرفتك ومتابعات حسب
            شخصية العميل، ويحدّد حالة الحل.
          </p>
          <Link
            href="/dashboard/arena"
            className="text-xs text-brand-200 hover:underline inline-flex items-center gap-1 mt-1"
          >
            رجوع لساحة الاختبار <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm"
          >
            {cats.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            onClick={run}
            disabled={running}
            className="px-4 py-2 rounded-xl bg-brand-500/20 border border-brand-500/40 text-brand-100 text-sm font-medium inline-flex items-center gap-2 hover:bg-brand-500/30 disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{" "}
            محاكاة محادثة
          </button>
        </div>
      </div>

      {running && (
        <div className="rounded-xl border border-brand-500/30 bg-brand-500/[0.06] px-4 py-3 text-sm text-brand-200 inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> يجري توليد المحادثة دور بدور…
        </div>
      )}

      {loading && !convs.length ? (
        <div className="p-12 text-center text-slate-400">
          <Loader2 className="mx-auto h-7 w-7 animate-spin" />
        </div>
      ) : convs.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-slate-400 flex flex-col items-center gap-3">
          <MessagesSquare className="h-10 w-10 opacity-40" />
          <div className="font-medium text-slate-200">لا توجد محادثات بعد</div>
          <div className="text-sm">
            اختر فئة واضغط «محاكاة محادثة» لتوليد محادثة كاملة متعددة الأدوار.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {convs.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 p-3">
                <div className="text-sm font-bold">
                  {c.persona}{" "}
                  <span className="text-xs text-slate-500">
                    · {c.category} · {c.turns} رسالة
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">ثقة {c.avgConfidence}%</span>
                  <span
                    className={`text-[11px] rounded-full border px-2 py-0.5 ${RES[c.resolutionState]?.cls}`}
                  >
                    {RES[c.resolutionState]?.label}
                  </span>
                </div>
              </div>
              <div className="p-3 space-y-2">
                {c.messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex gap-2 ${m.role === "assistant" ? "flex-row" : "flex-row-reverse"}`}
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${m.role === "assistant" ? "bg-brand-500/20 text-brand-200" : "bg-white/10 text-slate-300"}`}
                    >
                      {m.role === "assistant" ? (
                        <Bot className="h-4 w-4" />
                      ) : (
                        <User className="h-4 w-4" />
                      )}
                    </div>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${m.role === "assistant" ? "bg-brand-500/10 border border-brand-500/20" : "bg-white/5 border border-white/10"}`}
                    >
                      {m.content}
                      {m.role === "assistant" && (
                        <span className="block mt-1 text-[10px] text-slate-500">
                          ثقة {m.confidence}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
