"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const STATUS_AR: Record<string, string> = { connected: "متصل", connecting: "جاري الربط", disconnected: "غير متصل", service_unreachable: "الخدمة غير متاحة" };

function fmt(d?: string | null) { if (!d) return ""; try { return new Date(d).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }); } catch { return ""; } }

export default function WhatsappHealthClient({ initial, warnings, warnCount }: { initial: any; warnings: any[]; warnCount: number }) {
  const [status, setStatus] = useState<string>(initial.status);
  const [phone, setPhone] = useState<string | null>(initial.phone);
  const [checkedAt, setCheckedAt] = useState<string>("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  async function refresh() {
    try {
      const r = await fetch("/api/whatsapp/status", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (j?.status) { setStatus(j.status); if (j.phone) setPhone(j.phone); }
      setCheckedAt(new Date().toISOString());
    } catch {}
  }
  useEffect(() => { refresh(); const t = setInterval(refresh, 6000); return () => clearInterval(t); }, []);

  async function action(kind: "reconnect" | "restart" | "replace") {
    setBusy(kind); setMsg("");
    try {
      if (kind === "reconnect") {
        await fetch("/api/whatsapp/start", { method: "POST" });
        setMsg("بدأ إعادة الربط — افتح صفحة الربط لمسح الكود إن لزم.");
      } else if (kind === "restart") {
        await fetch("/api/whatsapp/logout", { method: "POST" });
        await fetch("/api/whatsapp/start", { method: "POST" });
        setMsg("أُعيد تشغيل الجلسة.");
      } else if (kind === "replace") {
        await fetch("/api/whatsapp/logout", { method: "POST" });
        setMsg("فُصلت الجلسة الحالية — اربط رقمًا جديدًا من صفحة الربط.");
      }
      setTimeout(refresh, 1500);
    } finally { setBusy(""); }
  }

  const ok = status === "connected";
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4"><div className="text-slate-400 text-xs mb-1">الحالة</div><div className={`text-sm font-bold ${ok ? "text-emerald-300" : status === "service_unreachable" ? "text-rose-300" : "text-amber-300"}`}>{STATUS_AR[status] || status}</div></div>
        <div className="card p-4"><div className="text-slate-400 text-xs mb-1">الرقم المرتبط</div><div className="text-sm font-mono" dir="ltr">{phone || "—"}</div></div>
        <div className="card p-4"><div className="text-slate-400 text-xs mb-1">تحذيرات/حدود</div><div className={`text-sm font-bold ${warnCount > 0 ? "text-amber-300" : "text-emerald-300"}`}>{warnCount}</div></div>
        <div className="card p-4"><div className="text-slate-400 text-xs mb-1">آخر فحص</div><div className="text-xs">{checkedAt ? fmt(checkedAt) : "..."}</div></div>
      </div>

      <div className="card p-4 flex flex-wrap items-center gap-2">
        <button onClick={() => action("reconnect")} disabled={!!busy} className="rounded bg-brand-500/15 text-brand-300 px-3 py-1.5 text-sm disabled:opacity-50">إعادة الربط</button>
        <button onClick={() => action("restart")} disabled={!!busy} className="rounded bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-50">إعادة تشغيل الجلسة</button>
        <button onClick={() => action("replace")} disabled={!!busy} className="rounded bg-rose-500/10 text-rose-300 px-3 py-1.5 text-sm disabled:opacity-50">استبدال الجلسة (فصل)</button>
        <Link href="/dashboard/whatsapp" className="rounded bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10">صفحة الربط (QR)</Link>
        {msg && <span className="text-xs text-slate-300">{msg}</span>}
      </div>

      <div className="card p-5">
        <h2 className="font-bold mb-2 text-sm">آخر التحذيرات وحدود الإرسال</h2>
        {warnings.length === 0 ? <p className="text-slate-500 text-sm">لا توجد تحذيرات. ✓</p> : (
          <ul className="space-y-1 text-xs">
            {warnings.map((w, n) => (
              <li key={n} className="flex items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${w.severity === "critical" || w.severity === "block" ? "bg-rose-400" : "bg-amber-400"}`} />
                <span className="font-mono text-slate-500">{w.category}</span>
                <span className="text-slate-300">{w.title}</span>
                <span className="text-slate-600">{fmt(w.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
