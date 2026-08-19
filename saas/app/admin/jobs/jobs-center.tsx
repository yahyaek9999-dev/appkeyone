"use client";

import { useState } from "react";
import { Play, Clock, CheckCircle2, XCircle, Loader2, Timer } from "lucide-react";
import type { CronJob } from "@/lib/admin/jobs-registry";
import { cadenceLabel } from "@/lib/admin/jobs-registry";

type RunState = {
  status: "idle" | "running" | "ok" | "error";
  durationMs?: number;
  message?: string;
  at?: string;
};

function JobRow({ job }: { job: CronJob }) {
  const [run, setRun] = useState<RunState>({ status: "idle" });

  async function trigger() {
    setRun({ status: "running" });
    try {
      const r = await fetch("/api/admin/jobs/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: job.endpoint }),
      });
      const j = await r.json();
      if (j.ok) {
        setRun({ status: "ok", durationMs: j.durationMs, at: new Date().toLocaleTimeString("ar-EG") });
      } else {
        setRun({ status: "error", durationMs: j.durationMs, message: j.error || `HTTP ${j.status}`, at: new Date().toLocaleTimeString("ar-EG") });
      }
    } catch (e: any) {
      setRun({ status: "error", message: e?.message || "فشل الاتصال" });
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">{job.label}</span>
          <code className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-slate-400">/api/cron/{job.endpoint}</code>
        </div>
        <div className="mt-0.5 text-[12px] text-slate-400">{job.description}</div>
      </div>

      {/* Live result of the manual run (real, not fabricated history) */}
      <div className="hidden w-40 shrink-0 text-[11px] sm:block">
        {run.status === "ok" && (
          <span className="inline-flex items-center gap-1 text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> نجح · {run.durationMs}ms
          </span>
        )}
        {run.status === "error" && (
          <span className="inline-flex items-center gap-1 text-rose-300">
            <XCircle className="h-3.5 w-3.5" /> {run.message}
          </span>
        )}
        {run.status === "idle" && <span className="text-slate-600">لم تُشغّل يدوياً</span>}
        {run.status === "running" && (
          <span className="inline-flex items-center gap-1 text-slate-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ التشغيل…
          </span>
        )}
      </div>

      <button
        onClick={trigger}
        disabled={run.status === "running"}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-white/[0.16] hover:bg-white/[0.08] disabled:opacity-50"
      >
        {run.status === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        شغّل الآن
      </button>
    </div>
  );
}

export default function JobsCenter({ minutely, hourly }: { minutely: CronJob[]; hourly: CronJob[] }) {
  return (
    <div className="space-y-6">
      <Section icon={<Timer className="h-4 w-4 text-brand-400" />} title="كل دقيقة" cadence={cadenceLabel("minutely")} jobs={minutely} />
      <Section icon={<Clock className="h-4 w-4 text-brand-400" />} title="كل ساعة" cadence={cadenceLabel("hourly")} jobs={hourly} />
      <p className="text-[11px] leading-relaxed text-slate-500">
        ملاحظة: سِجلّ عمليات التشغيل التاريخية غير مُخزَّن في التصميم الحالي للمهام؛ تعرض هذه الصفحة نتيجة التشغيل اليدوي فقط.
        الجدولة الفعلية تُدار عبر مؤقّتات systemd على الخادم.
      </p>
    </div>
  );
}

function Section({ icon, title, cadence, jobs }: { icon: React.ReactNode; title: string; cadence: string; jobs: CronJob[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold text-white">{title}</span>
        <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] text-slate-400">{cadence}</span>
        <span className="text-[11px] text-slate-500">· {jobs.length} مهمة</span>
      </div>
      <div className="space-y-2">
        {jobs.map((j) => (
          <JobRow key={j.endpoint} job={j} />
        ))}
      </div>
    </div>
  );
}
