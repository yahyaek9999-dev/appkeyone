"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, Loader2, ShieldAlert, ChevronDown } from "lucide-react";
import type { SecurityResult, SecurityEvent } from "@/lib/admin/security";

const SEV: Record<string, { label: string; cls: string; dot: string }> = {
  critical: { label: "حرج", cls: "text-rose-300", dot: "bg-rose-500" },
  warn: { label: "تحذير", cls: "text-amber-300", dot: "bg-amber-400" },
  info: { label: "معلومة", cls: "text-slate-300", dot: "bg-slate-500" },
};
const SOURCE_LABEL: Record<string, string> = { protection: "الحماية", admin_audit: "تدقيق المشرف", api_error: "خطأ API" };

export default function SecurityCenter({ initial }: { initial: SecurityResult }) {
  const [data, setData] = useState<SecurityResult>(initial);
  const [loading, setLoading] = useState(false);
  const [severity, setSeverity] = useState("");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  const params = useCallback(() => {
    const p = new URLSearchParams();
    if (severity) p.set("severity", severity);
    if (source) p.set("source", source);
    if (q.trim()) p.set("q", q.trim());
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    p.set("page", String(page));
    return p;
  }, [severity, source, q, from, to, page]);

  useEffect(() => { setPage(1); }, [severity, source, q, from, to]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/security?${params()}`, { cache: "no-store" });
        const j = await r.json();
        if (alive && j.ok) setData(j);
      } finally {
        if (alive) setLoading(false);
      }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [params]);

  const c = data.counts;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Chip label="حرج" value={c.critical} tone={c.critical > 0 ? "bad" : "ok"} />
        <Chip label="تحذير" value={c.warn} tone={c.warn > 0 ? "warn" : "ok"} />
        <Chip label="معلومات" value={c.info} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بريد التاجر…" className="w-44 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none" />
        </div>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-sm text-white">
          <option value="">كل الخطورات</option>
          <option value="critical">حرج</option>
          <option value="warn">تحذير</option>
          <option value="info">معلومة</option>
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-sm text-white">
          <option value="">كل المصادر</option>
          <option value="protection">الحماية</option>
          <option value="admin_audit">تدقيق المشرف</option>
          <option value="api_error">خطأ API</option>
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-sm text-white" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-sm text-white" />
        {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
        <span className="ms-auto text-[12px] text-slate-500">{c.total} حدث</span>
      </div>

      {/* Events */}
      <div className="space-y-1.5">
        {data.events.length === 0 && <div className="py-8 text-center text-[12px] text-slate-600">لا أحداث مطابقة.</div>}
        {data.events.map((e) => <EventRow key={e.id} e={e} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} />)}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-[12px]">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-white/[0.08] px-2.5 py-1 text-slate-300 disabled:opacity-40">السابق</button>
        <span className="text-slate-500">صفحة {data.page} من {data.pages}</span>
        <button disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-white/[0.08] px-2.5 py-1 text-slate-300 disabled:opacity-40">التالي</button>
      </div>
    </div>
  );
}

function EventRow({ e, open, onToggle }: { e: SecurityEvent; open: boolean; onToggle: () => void }) {
  const sev = SEV[e.severity];
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-right">
        <span className={`h-2 w-2 shrink-0 rounded-full ${sev.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">{e.summary}</span>
            <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-slate-400">{SOURCE_LABEL[e.source]}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">{new Date(e.at).toLocaleString("ar-EG")}</div>
        </div>
        <span className={`shrink-0 text-[11px] font-medium ${sev.cls}`}>{sev.label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="grid gap-2 border-t border-white/[0.06] px-4 py-3 text-[12px] sm:grid-cols-2">
          <Detail k="النوع" v={e.type} mono />
          <Detail k="الخطورة" v={sev.label} />
          <Detail k="المصدر" v={SOURCE_LABEL[e.source]} />
          <Detail k="الوقت" v={new Date(e.at).toLocaleString("ar-EG")} />
          {e.tenantEmail && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">التاجر:</span>
              <Link href={`/admin/tenants/${e.tenantId}`} className="text-brand-300 hover:text-brand-200" dir="ltr">{e.tenantEmail}</Link>
            </div>
          )}
          {e.actorEmail && <Detail k="المنفّذ" v={e.actorEmail} />}
          {e.ip && <Detail k="IP" v={e.ip} mono />}
          {e.refId && <Detail k="مرجع" v={e.refId} mono />}
        </div>
      )}
    </div>
  );
}

function Detail({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-slate-500">{k}:</span>
      <span className={`text-slate-200 ${mono ? "font-mono text-[11px]" : ""}`} dir={mono ? "ltr" : undefined}>{v}</span>
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "bad" }) {
  const c = tone === "bad" ? "text-rose-300" : tone === "warn" ? "text-amber-300" : tone === "ok" ? "text-emerald-300" : "text-white";
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <div className={`text-lg font-bold tabular-nums ${c}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
