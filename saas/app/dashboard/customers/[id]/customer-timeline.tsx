"use client";

import { ShoppingBag, Send, MessageSquare, BrainCircuit } from "lucide-react";

type TimelineEvent =
  | { kind: "message"; id: string; at: string; role: string; content: string }
  | { kind: "order"; id: string; at: string; status: string; total: number; currency: string; items: { name: string; quantity: number }[] }
  | { kind: "broadcast"; id: string; at: string; broadcastName: string; status: string }
  | { kind: "ai_gap"; id: string; at: string; prompt: string };

export default function CustomerTimeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) {
    return (
      <div className="card p-8 text-center text-sm text-slate-500">
        لا توجد أحداث مسجّلة بعد.
      </div>
    );
  }

  return (
    <div className="relative space-y-0">
      {/* vertical guide line */}
      <div className="absolute right-[19px] top-3 bottom-3 w-px bg-white/[0.06] pointer-events-none" />
      {events.map((ev) => (
        <div key={ev.id} className="relative flex items-start gap-3 pb-4">
          <div className="relative z-10 mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-canvas-deep">
            <EventIcon ev={ev} />
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <EventBody ev={ev} />
            <div className="mt-0.5 text-[10px] text-slate-600 tabular-nums" dir="ltr">
              {new Date(ev.at).toLocaleString("ar-EG", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EventIcon({ ev }: { ev: TimelineEvent }) {
  switch (ev.kind) {
    case "message":
      return <MessageSquare className={`h-4 w-4 ${ev.role === "user" ? "text-sky-400" : "text-emerald-400"}`} />;
    case "order":
      return <ShoppingBag className="h-4 w-4 text-brand-400" />;
    case "broadcast":
      return <Send className="h-4 w-4 text-violet-400" />;
    case "ai_gap":
      return <BrainCircuit className="h-4 w-4 text-amber-400" />;
  }
}

function EventBody({ ev }: { ev: TimelineEvent }) {
  if (ev.kind === "message") {
    return (
      <div>
        <span className={`text-[11px] font-semibold ${ev.role === "user" ? "text-sky-300" : "text-emerald-300"}`}>
          {ev.role === "user" ? "العميل" : "تلقائي"}
        </span>
        <p className="mt-0.5 text-xs text-slate-300 line-clamp-2 leading-relaxed">{ev.content}</p>
      </div>
    );
  }
  if (ev.kind === "order") {
    const label =
      ev.status === "delivered" ? "تم التسليم" :
      ev.status === "shipped" ? "شُحن" :
      ev.status === "confirmed" ? "مؤكد" :
      ev.status === "cancelled" || ev.status === "canceled" ? "ملغي" :
      "طلب جديد";
    return (
      <div>
        <span className="text-[11px] font-semibold text-brand-300">طلب — {label}</span>
        {ev.items.length > 0 && (
          <p className="mt-0.5 text-xs text-slate-400 line-clamp-1">
            {ev.items.map((i) => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join("، ")}
          </p>
        )}
        <span className="text-[11px] text-slate-500 tabular-nums">
          {(ev.total / 100).toLocaleString()} {ev.currency}
        </span>
      </div>
    );
  }
  if (ev.kind === "broadcast") {
    const statusLabel = ev.status === "sent" ? "أُرسلت" : ev.status === "failed" ? "فشل الإرسال" : "جدولة";
    return (
      <div>
        <span className="text-[11px] font-semibold text-violet-300">حملة — {statusLabel}</span>
        <p className="mt-0.5 text-xs text-slate-400 line-clamp-1">{ev.broadcastName}</p>
      </div>
    );
  }
  if (ev.kind === "ai_gap") {
    return (
      <div>
        <span className="text-[11px] font-semibold text-amber-300">سؤال لم يُجب عليه</span>
        <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">{ev.prompt}</p>
      </div>
    );
  }
  return null;
}
