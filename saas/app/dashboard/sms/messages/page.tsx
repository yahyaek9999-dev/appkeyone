"use client";

import { useState, useEffect } from "react";
import { useMutate } from "@/components/ui/use-mutate";
import { Send, RefreshCw } from "lucide-react";

type Msg = {
  id: string;
  to: string;
  body: string;
  purpose: string;
  status: string;
  segments: number;
  costUnits: number;
  sentAt?: string;
  deliveredAt?: string;
  failReason?: string;
  createdAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  delivered: "text-emerald-400",
  sent: "text-blue-400",
  queued: "text-slate-400",
  failed: "text-red-400",
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "text-slate-400";
  const labels: Record<string, string> = { delivered: "تم التسليم", sent: "أُرسل", queued: "في الانتظار", failed: "فشل" };
  return <span className={`text-xs font-medium ${color}`}>{labels[status] ?? status}</span>;
}

export default function SmsMessagesPage() {
  const mutate = useMutate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showSend, setShowSend] = useState(false);
  const [sendForm, setSendForm] = useState({ to: "", body: "" });

  async function load(p = page) {
    setLoading(true);
    const res = await fetch(`/api/sms/messages?page=${p}&pageSize=20`);
    const d = await res.json();
    setMessages(d.messages ?? []);
    setTotal(d.total ?? 0);
    setLoading(false);
  }

  useEffect(() => { load(); }, [page]);

  async function sendManual() {
    if (!(await mutate("/api/sms/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: sendForm.to, body: sendForm.body }),
    }))) return;
    setShowSend(false);
    setSendForm({ to: "", body: "" });
    load(1);
  }

  const pages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.05] pb-5">
        <div>
          <h1 className="page-title mb-1">سجل الرسائل</h1>
          <p className="page-desc">{total > 0 ? `${total} رسالة إجمالاً` : "مراقبة حالة الإرسال والتسليم"}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load(page)} className="btn-ghost flex items-center gap-2 text-sm">
            <RefreshCw className="h-4 w-4" /> تحديث
          </button>
          <button onClick={() => setShowSend(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Send className="h-4 w-4" /> إرسال
          </button>
        </div>
      </div>

      {showSend && (
        <div className="rounded-xl border border-white/10 bg-canvas-raised p-5 space-y-4">
          <h2 className="font-semibold text-white">إرسال رسالة</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-sm mb-1 block">رقم المستلم</label>
              <input value={sendForm.to} onChange={e => setSendForm(p => ({ ...p, to: e.target.value }))} className="input w-full text-sm font-mono" dir="ltr" placeholder="+966500000000" />
            </div>
          </div>
          <div>
            <label className="label-sm mb-1 block">نص الرسالة</label>
            <textarea value={sendForm.body} onChange={e => setSendForm(p => ({ ...p, body: e.target.value }))} className="input w-full text-sm min-h-[80px]" />
          </div>
          <div className="flex gap-2">
            <button onClick={sendManual} className="btn-primary text-sm">إرسال</button>
            <button onClick={() => setShowSend(false)} className="btn-ghost text-sm">إلغاء</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-slate-500 py-8">جاري التحميل...</p>
      ) : messages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
          <p className="text-slate-400">لا توجد رسائل بعد.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.07] bg-white/[0.02]">
                  <th className="px-4 py-3 text-right text-xs text-slate-400 font-medium">الرقم</th>
                  <th className="px-4 py-3 text-right text-xs text-slate-400 font-medium">الحالة</th>
                  <th className="px-4 py-3 text-right text-xs text-slate-400 font-medium">الرسالة</th>
                  <th className="px-4 py-3 text-right text-xs text-slate-400 font-medium">رسائل</th>
                  <th className="px-4 py-3 text-right text-xs text-slate-400 font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {messages.map(m => (
                  <tr key={m.id} className="bg-canvas-raised hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-white">{m.to}</td>
                    <td className="px-4 py-3"><StatusBadge status={m.status} />{m.failReason && <p className="text-xs text-red-400/70 mt-0.5">{m.failReason.slice(0, 40)}</p>}</td>
                    <td className="px-4 py-3 max-w-[200px] truncate text-slate-300">{m.body}</td>
                    <td className="px-4 py-3 text-center text-slate-400">{m.segments}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(m.createdAt).toLocaleDateString("ar-SA")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-ghost text-sm px-3 disabled:opacity-40">السابق</button>
              <span className="text-sm text-slate-400">{page} / {pages}</span>
              <button disabled={page === pages} onClick={() => setPage(p => p + 1)} className="btn-ghost text-sm px-3 disabled:opacity-40">التالي</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
