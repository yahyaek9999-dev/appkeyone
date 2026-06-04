"use client";

// Reusable inline insight strip.
//
// Drop <InsightStrip context="orders" /> (or any of: dashboard, customers,
// orders, broadcasts, revenue, automations, integrations) onto any page to get a
// compact card with ONE insight, ONE recommendation, and ONE action button.
//
// It fetches a small per-context payload from /api/copilot. The endpoint never
// 500s and degrades gracefully, but this component ALSO handles loading / empty
// / error inline — it must never crash or block the page it's mounted on.

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Lightbulb, ArrowLeft, RefreshCw, Loader2 } from "lucide-react";

type CopilotAction = { label: string; href: string } | null;

interface CopilotPayload {
  context: string;
  insight: string;
  recommendation: string;
  action: CopilotAction;
  generatedAt: string;
}

export default function InsightStrip({ context }: { context: string }) {
  const [data, setData] = useState<CopilotPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrored(false);
    try {
      const r = await fetch(`/api/copilot?context=${encodeURIComponent(context)}`, { cache: "no-store" });
      if (!r.ok) {
        setErrored(true);
        setData(null);
        return;
      }
      const j = (await r.json()) as CopilotPayload & { error?: string };
      if (!j || j.error) {
        setErrored(true);
        setData(null);
        return;
      }
      setData(j);
    } catch {
      setErrored(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="card p-4 animate-pulse" aria-busy="true" aria-label="Loading insights">
        <div className="mb-3 h-3 w-40 rounded bg-white/[0.06]" />
        <div className="mb-2 h-3 w-3/4 rounded bg-white/[0.06]" />
        <div className="h-3 w-1/2 rounded bg-white/[0.06]" />
      </div>
    );
  }

  if (errored || !data) {
    return (
      <div className="card flex items-center justify-between gap-3 p-4">
        <span className="flex items-center gap-2 text-xs text-slate-500">
          <Sparkles className="h-4 w-4 text-brand-400/60" />
          Could not load insights.
        </span>
        <button onClick={fetchData} disabled={loading} className="btn-ghost px-2.5 py-1.5 text-xs">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <Sparkles className="h-4 w-4 text-brand-400" />
          Insights
        </span>
        <button
          onClick={fetchData}
          disabled={loading}
          className="text-slate-500 transition hover:text-slate-300"
          title="Refresh"
          aria-label="Refresh insights"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
            <p className="text-sm leading-relaxed text-slate-200">{data.insight}</p>
          </div>
          {data.recommendation && (
            <div className="flex items-start gap-2">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-sm leading-relaxed text-slate-400">{data.recommendation}</p>
            </div>
          )}
        </div>

        {data.action && (
          <a href={data.action.href} className="btn-primary shrink-0 text-sm whitespace-nowrap">
            {data.action.label}
            <ArrowLeft className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}
