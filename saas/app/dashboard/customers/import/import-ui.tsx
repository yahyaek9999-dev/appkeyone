"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Upload, Loader2, CheckCircle2, Users, ArrowLeft, FileSpreadsheet } from "lucide-react";

type Row = { phone: string; name?: string };
type Result = { total: number; created: number; skipped: number; invalid: number };

function parseText(text: string): { rows: Row[]; invalid: number } {
  const rows: Row[] = [];
  let invalid = 0;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    // Accept "phone,name" / "phone\tname" / "name,phone" — phone = the token with most digits.
    const parts = t
      .split(/[,\t;]/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) continue;
    let phone = "";
    let name = "";
    if (parts.length === 1) {
      phone = parts[0];
    } else {
      const scored = parts.map((p) => ({ p, d: (p.replace(/[^\d]/g, "") || "").length }));
      scored.sort((a, b) => b.d - a.d);
      phone = scored[0].p;
      name = parts.filter((p) => p !== phone).join(" ");
    }
    const digits = phone.replace(/[^\d]/g, "");
    if (digits.length < 8) {
      invalid++;
      continue;
    }
    rows.push({ phone, name: name || undefined });
  }
  return { rows, invalid };
}

export default function ImportUi() {
  const [text, setText] = useState("");
  const [source, setSource] = useState<"paste" | "csv">("paste");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => parseText(text), [text]);
  const uniquePhones = useMemo(
    () => new Set(preview.rows.map((r) => r.phone.replace(/[^\d]/g, ""))).size,
    [preview.rows],
  );

  function onFile(file: File) {
    setSource("csv");
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ""));
    reader.readAsText(file);
  }

  async function submit() {
    if (!preview.rows.length) {
      setError("لا توجد أرقام صالحة للاستيراد");
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/customers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: preview.rows, source }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j.error || "فشل الاستيراد");
        return;
      }
      setResult({ total: j.total, created: j.created, skipped: j.skipped, invalid: j.invalid });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card p-5 space-y-3">
        <h2 className="section-title flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-brand-400" /> البيانات
        </h2>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSource("paste");
            setResult(null);
          }}
          rows={12}
          dir="ltr"
          className="input resize-none px-3 py-2 font-mono text-sm"
          placeholder={"+201000000001, أحمد\n+201000000002, سارة\n01000000003"}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="btn-ghost px-3 py-2 text-xs"
          >
            <Upload className="h-3.5 w-3.5" /> رفع ملف CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <span className="text-[11px] text-slate-500">
            صيغة كل سطر: رقم الهاتف، الاسم (اختياري)
          </span>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="section-title">المعاينة والتأكيد</h2>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="أرقام صالحة" value={uniquePhones} tone="ok" />
          <Stat
            label="غير صالحة"
            value={preview.invalid}
            tone={preview.invalid ? "warn" : "muted"}
          />
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {result ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="flex items-center gap-2 font-bold text-emerald-300">
              <CheckCircle2 className="h-5 w-5" /> تم الاستيراد بنجاح
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
              <ResultStat label="أُضيفوا" value={result.created} cls="text-emerald-300" />
              <ResultStat label="مكرّر (تخطّي)" value={result.skipped} cls="text-amber-300" />
              <ResultStat label="غير صالح" value={result.invalid} cls="text-rose-300" />
            </div>
            <div className="mt-3 text-xs text-slate-400">
              إجمالي الصفوف المعالجة: {result.total}
            </div>
            <Link
              href="/dashboard/customers"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-300 hover:text-brand-200"
            >
              <ArrowLeft className="h-4 w-4" /> الذهاب لقائمة العملاء
            </Link>
          </div>
        ) : (
          <button
            onClick={submit}
            disabled={submitting || !preview.rows.length}
            className="btn-primary w-full px-4 py-2.5 text-sm disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Users className="h-4 w-4" />
            )}
            استيراد {uniquePhones > 0 ? `(${uniquePhones})` : ""}
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "muted";
}) {
  const cls =
    tone === "ok" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-slate-400";
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3 text-center">
      <div className={`text-2xl font-bold ${cls}`}>{value.toLocaleString()}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">{label}</div>
    </div>
  );
}

function ResultStat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div>
      <div className={`text-xl font-extrabold ${cls}`}>{value.toLocaleString()}</div>
      <div className="text-[11px] text-slate-400">{label}</div>
    </div>
  );
}
