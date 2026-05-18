"use client";
import { useEffect, useRef, useState } from "react";
import { Send, AlertCircle, RotateCw } from "lucide-react";

type M = { role: "user" | "assistant" | "system"; content: string; flagged?: boolean };

export default function Playground() {
  const [phone, setPhone] = useState("+201111111111");
  const [name, setName] = useState("عميل تجريبي");
  const [msgs, setMsgs] = useState<M[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [msgs]);

  async function send() {
    if (!text.trim() || busy) return;
    const userText = text;
    setText("");
    setMsgs((m) => [...m, { role: "user", content: userText }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          customerPhone: customerId ? undefined : phone,
          customerName: customerId ? undefined : name,
          message: userText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطأ");
      if (!customerId) setCustomerId(data.customerId);
      setMsgs((m) => [...m, { role: "assistant", content: data.reply, flagged: data.flagged }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "system", content: "خطأ: " + e.message }]);
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    setMsgs([]);
    setCustomerId(null);
  }

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-6">
      <div className="card p-5 space-y-4 h-fit">
        <div>
          <label className="label">اسم العميل التجريبي</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!!customerId} />
        </div>
        <div>
          <label className="label">رقم الواتساب</label>
          <input className="input" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!!customerId} />
        </div>
        <button onClick={reset} className="btn-ghost w-full text-sm">
          <RotateCw className="w-4 h-4" />
          محادثة جديدة
        </button>
        <div className="text-xs text-slate-500 pt-2 border-t border-white/5">
          💡 لما البوت يكشف رسالة فيها كلمة "تحويل" أو "اوردر" هتشوف تنبيه برتقالي.
        </div>
      </div>

      <div className="card flex flex-col h-[70vh]">
        <div className="flex-1 overflow-y-auto p-5 space-y-3" style={{ background: "#0a0f13" }}>
          {msgs.length === 0 && (
            <div className="text-center text-slate-500 text-sm py-12">
              ابدأ محادثة. مثلاً: "السلام عليكم, عايز اعرف الأسعار"
            </div>
          )}
          {msgs.map((m, i) => {
            if (m.role === "system") return <div key={i} className="text-center text-xs text-red-300">{m.content}</div>;
            const out = m.role === "user";
            return (
              <div key={i} className={`flex ${out ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${out ? "bg-slate-800" : "bg-brand-600/30 border border-brand-500/30"} ${m.flagged ? "ring-2 ring-amber-500/50" : ""}`}>
                  {m.flagged && (
                    <div className="flex items-center gap-1 text-xs text-amber-300 mb-1">
                      <AlertCircle className="w-3 h-3" /> تم اكتشاف أوردر — تنبيه أُرسل
                    </div>
                  )}
                  <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                </div>
              </div>
            );
          })}
          {busy && (
            <div className="flex justify-end">
              <div className="bg-brand-600/30 border border-brand-500/30 rounded-2xl px-4 py-2.5">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                  <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-white/5 p-3 flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="اكتب رسالة كأنك العميل..."
            className="input flex-1 resize-none"
          />
          <button onClick={send} disabled={busy || !text.trim()} className="btn-primary px-4">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
