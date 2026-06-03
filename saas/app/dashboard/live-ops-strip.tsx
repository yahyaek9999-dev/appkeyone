"use client";

import { AlertTriangle, Megaphone, Phone, MessageSquareWarning, Send } from "lucide-react";
import { LiveBadge } from "@/components/ui/live-badge";
import { StatusDot } from "@/components/ui/status-dot";
import { useRealtimeSnapshot } from "@/hooks/use-realtime";

export function LiveOpsStrip() {
  const { state, snapshot } = useRealtimeSnapshot({ fallbackMs: 30000 });
  const wa = snapshot?.whatsapp;
  const t = snapshot?.totals;
  const connected = wa?.status === "connected";
  const queuePending = (t?.outgoingQueued || 0) + (t?.outgoingScheduled || 0);
  const queueHasIssues = (t?.outgoingFailed24h || 0) > 0 || (t?.outgoingStaleQueued || 0) > 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <div className="card p-4 lg:col-span-1">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="kpi-label">حالة المنصة</div>
            <div className="mt-0.5 text-sm font-semibold text-white">مباشر</div>
          </div>
          <LiveBadge state={state} />
        </div>
      </div>

      <LiveTile icon={<Phone className="h-4 w-4" />} label="واتساب"
        value={connected ? "متصل" : wa?.status || "غير متصل"}
        tone={connected ? "online" : "warning"}
        hint={wa?.phone || (wa?.mode === "meta_cloud" ? "Meta Cloud" : "ربط QR")} />
      <LiveTile icon={<MessageSquareWarning className="h-4 w-4" />} label="تصعيدات مفتوحة"
        value={String(t?.escalationActive ?? "—")}
        tone={(t?.escalationCritical || 0) > 0 ? "warning" : (t?.escalationActive || 0) > 0 ? "ai" : "online"}
        hint={`${t?.escalationCritical || 0} حرجة`} />
      <LiveTile icon={<Megaphone className="h-4 w-4" />} label="حملات نشطة"
        value={String(t?.broadcastsActive ?? "—")}
        tone={(t?.broadcastsActive || 0) > 0 ? "ai" : "neutral"}
        hint="قيد الإرسال / منتظرة" />
      <LiveTile icon={<Send className="h-4 w-4" />} label="طابور الإرسال"
        value={String(queuePending || t?.outgoingSending || "—")}
        tone={queueHasIssues ? "warning" : queuePending > 0 ? "ai" : "online"}
        hint={`${t?.outgoingSending || 0} إرسال · ${t?.outgoingFailed24h || 0} فشل/24س`} />
      <LiveTile icon={<AlertTriangle className="h-4 w-4" />} label="تنبيهات آخر 24 ساعة"
        value={String(t?.alerts24h ?? "—")}
        tone={(t?.alerts24h || 0) > 0 ? "warning" : "online"}
        hint="أمان وتنبيهات الغضب" />
    </div>
  );
}

function LiveTile({ icon, label, value, tone, hint }: {
  icon: React.ReactNode; label: string; value: string;
  tone: "online" | "warning" | "ai" | "neutral"; hint: string;
}) {
  return (
    <div className="card-hover p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.04] bg-white/[0.03] text-brand-300">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-slate-500">{label}</div>
          <div className="truncate text-sm font-semibold text-white">{value}</div>
          <div className="truncate text-[10px] text-slate-600">{hint}</div>
        </div>
        <StatusDot tone={tone} pulse={tone === "online" || tone === "ai"} />
      </div>
    </div>
  );
}
