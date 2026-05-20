"use client";

import {
  AlertTriangle,
  Megaphone,
  Phone,
  MessageSquareWarning,
} from "lucide-react";
import { LiveBadge } from "@/components/ui/live-badge";
import { StatusDot } from "@/components/ui/status-dot";
import { useRealtimeSnapshot } from "@/hooks/use-realtime";

export function LiveOpsStrip() {
  const { state, snapshot } = useRealtimeSnapshot({ fallbackMs: 30000 });
  const wa = snapshot?.whatsapp;
  const connected = wa?.status === "connected";

  return (
    <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-5">
      <div className="card card-glow p-4 lg:col-span-1">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs text-slate-400">حالة المنصة</div>
            <div className="mt-1 text-sm font-bold text-slate-100">
              Realtime Ops
            </div>
          </div>
          <LiveBadge state={state} />
        </div>
      </div>

      <LiveTile
        icon={<Phone className="size-4" />}
        label="واتساب"
        value={connected ? "متصل" : wa?.status || "غير متصل"}
        tone={connected ? "online" : "warning"}
        hint={
          wa?.phone || (wa?.mode === "meta_cloud" ? "Meta Cloud" : "QR mode")
        }
      />
      <LiveTile
        icon={<MessageSquareWarning className="size-4" />}
        label="تصعيدات مفتوحة"
        value={String(snapshot?.totals.escalationActive ?? "—")}
        tone={
          (snapshot?.totals.escalationCritical || 0) > 0
            ? "warning"
            : (snapshot?.totals.escalationActive || 0) > 0
              ? "ai"
              : "online"
        }
        hint={`${snapshot?.totals.escalationCritical || 0} حرجة`}
      />
      <LiveTile
        icon={<Megaphone className="size-4" />}
        label="حملات نشطة"
        value={String(snapshot?.totals.broadcastsActive ?? "—")}
        tone={(snapshot?.totals.broadcastsActive || 0) > 0 ? "ai" : "neutral"}
        hint="queued / sending"
      />
      <LiveTile
        icon={<AlertTriangle className="size-4" />}
        label="تنبيهات آخر 24 ساعة"
        value={String(snapshot?.totals.alerts24h ?? "—")}
        tone={(snapshot?.totals.alerts24h || 0) > 0 ? "warning" : "online"}
        hint="Safety + angry alerts"
      />
    </div>
  );
}

function LiveTile({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "online" | "warning" | "ai" | "neutral";
  hint: string;
}) {
  return (
    <div className="card group relative overflow-hidden p-4 transition hover:border-brand-500/25 hover:bg-slate-900/80">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/40 to-transparent opacity-0 transition group-hover:opacity-100" />
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-brand-300">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-xs text-slate-400">{label}</div>
            <div className="truncate text-sm font-bold text-white">{value}</div>
            <div className="truncate text-[10px] text-slate-500">{hint}</div>
          </div>
        </div>
        <StatusDot tone={tone} pulse={tone === "online" || tone === "ai"} />
      </div>
    </div>
  );
}
