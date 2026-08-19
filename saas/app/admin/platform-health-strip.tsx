"use client";

// Platform Health strip for the Admin Command Center. Reuses the EXISTING
// admin-gated aggregator GET /api/system/health (no new backend). Renders one
// badge per real subsystem with its real verdict + detail, linking to the full
// /admin/system-health page. Fails soft: if the endpoint is unreachable it says
// so rather than showing a fake "healthy".

import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

type SubsystemState = "ok" | "degraded" | "down" | "unknown";
type Subsystem = { status: SubsystemState; detail: string };

const LABELS: Record<string, string> = {
  database: "قاعدة البيانات",
  redis: "Redis",
  whatsapp: "واتساب",
  queue: "الطابور",
  aiProvider: "الذكاء الاصطناعي",
  worker: "العامل",
  bridgeGateway: "بوابة Bridge",
};

const PILL: Record<SubsystemState, string> = {
  ok: "adm-pill-ok",
  degraded: "adm-pill-warn",
  down: "adm-pill-bad",
  unknown: "adm-pill-neutral",
};

export default function PlatformHealthStrip() {
  const [subsystems, setSubsystems] = useState<Record<string, Subsystem> | null>(null);
  const [overall, setOverall] = useState<SubsystemState | null>(null);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch("/api/system/health", { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (!alive) return;
        setSubsystems(j.subsystems || {});
        setOverall(j.overall || null);
        setErr(false);
      } catch {
        if (alive) setErr(true);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div>
      {loading && (
        <div className="adm-panel adm-panel-pad adm-note" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ قراءة حالة الأنظمة…
        </div>
      )}

      {!loading && err && (
        <div className="adm-panel adm-panel-pad" style={{ color: "#fda4af", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertCircle className="h-3.5 w-3.5" /> تعذّر قراءة حالة الأنظمة (نقطة /api/system/health غير متاحة).
        </div>
      )}

      {!loading && !err && subsystems && (
        <div className="adm-tablewrap">
          <div className="adm-tablescroll">
            <table className="adm-table">
              <tbody>
                {Object.entries(subsystems).map(([key, s]) => (
                  <tr key={key}>
                    <td style={{ fontWeight: 600, color: "var(--adm-text)", width: 180 }}>{LABELS[key] || key}</td>
                    <td className="adm-note" style={{ color: "var(--adm-text-3)" }}>{s.detail}</td>
                    <td style={{ textAlign: "end", width: 130 }}>
                      <span className={`adm-pill ${PILL[s.status]}`}><span className="dot" />{STATE_LABEL[s.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const STATE_LABEL: Record<SubsystemState, string> = { ok: "سليم", degraded: "متدهور", down: "معطّل", unknown: "غير معروف" };
