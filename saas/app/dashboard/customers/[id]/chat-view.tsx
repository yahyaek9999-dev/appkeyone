"use client";
import { useEffect, useRef, useState } from "react";
import { Send, AlertCircle } from "lucide-react";
import { fmtDate } from "@/lib/utils";

export default function ChatView({
  customerId,
  initialMessages,
}: {
  customerId: string;
  initialMessages: any[];
}) {
  const [msgs, setMsgs] = useState<any[]>(initialMessages);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function send() {
    if (!text.trim() || busy) return;
    const userMsg = { role: "user", content: text, createdAt: new Date().toISOString(), flagged: false };
    setMsgs((m) => [...m, userMsg]);
    setText("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, message: userMsg.content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطأ");
      setMsgs((m) => [...m, { role: "assistant", content: data.reply, createdAt: new Date().toISOString(), flagged: data.flagged }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "system", content: "خطأ: " + e.message, createdAt: new Date().toISOString() }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex flex-col h-[70vh]">
      <div className="flex-1 overflow-y-auto p-5 space-y-3" style={{ background: "#0c0c10" }}>
        {msgs.length === 0 && (
          <div className="text-center text-slate-500 text-sm py-12">
            لسه ما فيش رسائل في المحادثة دي
          </div>
        )}
        {msgs.map((m, i) => {
          if (m.role === "system") {
            return (
              <div key={i} className="text-center text-xs text-red-300">{m.content}</div>
            );
          }
          const out = m.role === "user";
          return (
            <div key={i} className={`flex ${out ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  out ? "bg-slate-800" : "bg-brand-600/30 border border-brand-500/30"
                } ${m.flagged ? "ring-2 ring-amber-500/50" : ""}`}
              >
                {m.flagged && (
                  <div className="flex items-center gap-1 text-xs text-amber-300 mb-1">
                    <AlertCircle className="w-3 h-3" /> تنبيه أوردر
                  </div>
                )}
                <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                <div className="text-[10px] text-slate-500 mt-1 text-left">
                  {fmtDate(m.createdAt)}
                </div>
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
        <button onClick={send} disabled={busy} className="btn-primary px-4">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
