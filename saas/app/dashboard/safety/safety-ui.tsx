"use client";

import { useEffect, useState } from "react";
import { Shield, AlertTriangle, Activity, Zap, Power, RefreshCw, CheckCircle2 } from "lucide-react";

interface SafetyData {
  state: any;
  limits: any;
  counters: {
    sends24h: number; failures24h: number; cooldowns24h: number; reconnects24h: number;
    inbound24h?: number; spamFails24h?: number; techFails24h?: number; softenedCount?: number;
  };
  diagnostics?: {
    outboundInboundRatio: number;
    healthTrend: "green" | "yellow" | "red";
    queuePressure: number;
    topReasons: { reason: string; count: number }[];
    lastCooldownReasons: string[];
  };
  events: any[];
  audits: any[];
}

const RISK_COLORS: Record<string, string> = {
  low: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  elevated: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  slow_mode: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  cooldown: "text-red-400 bg-red-500/10 border-red-500/30",
  emergency_stop: "text-red-500 bg-red-600/20 border-red-500/50",
  kill_all: "text-red-600 bg-red-700/30 border-red-600/60",
};

function riskLabelOf(score: number): { label: string; key: string } {
  if (score >= 95) return { label: "إيقاف كامل", key: "kill_all" };
  if (score >= 85) return { label: "إيقاف طارئ", key: "emergency_stop" };
  if (score >= 75) return { label: "تبريد", key: "cooldown" };
  if (score >= 60) return { label: "وضع بطيء", key: "slow_mode" };
  if (score >= 35) return { label: "مرتفع", key: "elevated" };
  return { label: "آمن", key: "low" };
}

function formatMs(ms: number): string {
  if (!ms || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} ث`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} دقيقة`;
  const h = Math.floor(m / 60);
  return `${h} ساعة ${m % 60} دقيقة`;
}

const STAGE_LABELS: Record<string, string> = {
  day1:   "اليوم 1 — رد فقط",
  day2_3: "اليوم 2-3 — رد فقط",
  day4_5: "اليوم 4-5 — تدرّج",
  day6_7: "اليوم 6-7 — تدرّج",
  week2:  "الأسبوع 2",
  mature: "ناضج",
};

export default function SafetyDashboard() {
  const [data, setData] = useState<SafetyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/safety/state", { cache: "no-store" });
      if (r.ok) setData(await r.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  async function clearKill() {
    if (!confirm("سيتم إلغاء الإيقاف الطارئ والسماح بالإرسال مرة أخرى. متأكد؟")) return;
    setClearing(true);
    await fetch("/api/safety/clear-kill", { method: "POST" });
    await load();
    setClearing(false);
  }

  if (loading) return <div className="p-8 text-center text-slate-400">جارٍ التحميل…</div>;
  if (!data) return <div className="p-8 text-center text-red-400">فشل تحميل بيانات الأمان</div>;

  const { state, limits, counters, events, audits, diagnostics } = data;
  const risk = riskLabelOf(state.riskScore);
  const dailyPct = Math.round((state.dailySends / Math.max(1, limits.maxDaily)) * 100);
  const stageLabel = STAGE_LABELS[state.warmupStage] || state.warmupStage;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-emerald-400" />
            مركز الأمان والحماية من الحظر
          </h1>
          <p className="text-sm text-slate-400 mt-1">يتحدث كل 10 ثوانٍ</p>
        </div>
        <button onClick={load} className="text-sm text-slate-400 hover:text-white flex items-center gap-1.5">
          <RefreshCw className="w-4 h-4" /> تحديث
        </button>
      </div>

      {state.killSwitchActive && (
        <div className="card p-5 border-red-500/50 bg-red-500/5">
          <div className="flex items-start gap-3">
            <Power className="w-6 h-6 text-red-500 mt-0.5" />
            <div className="flex-1">
              <div className="text-lg font-bold text-red-400">الإيقاف الطارئ مفعّل</div>
              <div className="text-sm text-slate-300 mt-1">السبب: {state.killSwitchReason || "—"}</div>
              <div className="text-xs text-slate-500 mt-1">
                منذ: {new Date(state.killSwitchAt).toLocaleString("ar-EG")}
              </div>
            </div>
            <button
              onClick={clearKill}
              disabled={clearing}
              className="px-4 py-2 bg-red-500 hover:bg-red-400 text-white rounded-lg font-medium disabled:opacity-50"
            >
              {clearing ? "..." : "إلغاء الإيقاف"}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card title="مستوى الخطر" icon={<AlertTriangle className="w-5 h-5" />}>
          <div className={`text-2xl font-bold inline-block px-3 py-1 rounded-lg border ${RISK_COLORS[risk.key]}`}>
            {risk.label}
          </div>
          <div className="text-xs text-slate-500 mt-2">النقاط: {state.riskScore} / 100</div>
        </Card>

        <Card title="مرحلة الإحماء" icon={<Activity className="w-5 h-5 text-blue-400" />}>
          <div className="text-lg font-bold">{stageLabel}</div>
          <div className="text-xs text-slate-500 mt-2">{limits.description}</div>
        </Card>

        <Card title="السقف اليومي" icon={<Zap className="w-5 h-5 text-yellow-400" />}>
          <div className="text-2xl font-bold">{state.dailySends} / {limits.maxDaily}</div>
          <div className="mt-2 h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full ${dailyPct >= 90 ? "bg-red-500" : dailyPct >= 70 ? "bg-yellow-500" : "bg-emerald-500"}`}
              style={{ width: `${Math.min(100, dailyPct)}%` }}
            />
          </div>
        </Card>

        <Card title="حالة التبريد" icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}>
          {state.cooldownRemainingMs > 0 ? (
            <>
              <div className="text-lg font-bold text-orange-400">في تبريد</div>
              <div className="text-xs text-slate-500 mt-1">باقي: {formatMs(state.cooldownRemainingMs)}</div>
            </>
          ) : (
            <>
              <div className="text-lg font-bold text-emerald-400">نشط</div>
              <div className="text-xs text-slate-500 mt-1">جاهز للإرسال</div>
            </>
          )}
        </Card>
      </div>

      {counters.sends24h === 0 && (counters.inbound24h ?? 0) === 0 && (
        <div className="card p-4 bg-blue-500/5 border-blue-500/30 text-sm text-slate-300">
          <strong className="text-blue-300">لا توجد نشاط حقيقي خلال آخر 24 ساعة.</strong>
          <p className="text-xs text-slate-400 mt-1">
            كل الأرقام أدناه تأتي من قاعدة البيانات مباشرةً (SafetyEvent + SafetyState).
            ابدأ المحادثة مع عميل حقيقي لرؤية البيانات تتراكم لحظياً.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="إرسال خلال 24س" value={counters.sends24h} />
        <Stat label="رسائل واردة خلال 24س" value={counters.inbound24h ?? 0} />
        <Stat
          label="فشل سبام / تقني"
          value={(counters.spamFails24h ?? 0)}
          extra={`(${counters.techFails24h ?? 0} تقني)`}
          tone={(counters.spamFails24h ?? 0) >= 3 ? "danger" : (counters.failures24h > 5 ? "warn" : "ok")}
        />
        <Stat
          label="تبريد / إعادة اتصال"
          value={counters.cooldowns24h}
          extra={`(${counters.reconnects24h} إعادة اتصال)`}
          tone={counters.cooldowns24h > 0 ? "warn" : "ok"}
        />
      </div>

      {diagnostics && (
        <div className="card p-5">
          <h3 className="text-lg font-bold mb-3">تشخيصات الأمان</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-slate-500">صحة الحساب</div>
              <div className={`font-bold text-lg ${
                diagnostics.healthTrend === "green" ? "text-emerald-400" :
                diagnostics.healthTrend === "yellow" ? "text-yellow-400" : "text-red-400"
              }`}>
                {diagnostics.healthTrend === "green" ? "ممتاز" :
                 diagnostics.healthTrend === "yellow" ? "تحت المراقبة" : "في خطر"}
              </div>
            </div>
            <div>
              <div className="text-slate-500">نسبة الإرسال / الوارد</div>
              <div className={`font-bold text-lg ${
                diagnostics.outboundInboundRatio > 5 ? "text-red-400" :
                diagnostics.outboundInboundRatio > 2.5 ? "text-yellow-400" : "text-emerald-400"
              }`}>
                {diagnostics.outboundInboundRatio.toFixed(2)} : 1
              </div>
            </div>
            <div>
              <div className="text-slate-500">ضغط الطابور</div>
              <div className="font-bold text-lg">{Math.round(diagnostics.queuePressure * 100)}%</div>
              <div className="mt-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full ${diagnostics.queuePressure >= 0.9 ? "bg-red-500" : diagnostics.queuePressure >= 0.7 ? "bg-yellow-500" : "bg-emerald-500"}`}
                  style={{ width: `${Math.min(100, diagnostics.queuePressure * 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="text-slate-500">تبريد مُخفّف للردود</div>
              <div className="font-bold text-lg text-emerald-400">{counters.softenedCount ?? 0}</div>
              <div className="text-[10px] text-slate-500 mt-1">حالات تم تحويلها لوضع بطيء</div>
            </div>
          </div>

          {diagnostics.topReasons.length > 0 && (
            <div className="mt-4">
              <div className="text-xs text-slate-500 mb-2">أكثر أسباب التبريد تكراراً (24س)</div>
              <div className="flex flex-wrap gap-2">
                {diagnostics.topReasons.map((r) => (
                  <span key={r.reason} className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs">
                    <span className="text-slate-300">{r.reason}</span>
                    <span className="text-slate-500"> ×{r.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {diagnostics.lastCooldownReasons.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-slate-500 mb-1">سبب آخر تبريد</div>
              <div className="text-xs text-slate-300">{diagnostics.lastCooldownReasons.join(" • ")}</div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="text-lg font-bold mb-3">أحداث الأمان (آخر 50)</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {audits.length === 0 && <div className="text-sm text-slate-500">لا توجد أحداث</div>}
            {audits.map((a: any) => (
              <div
                key={a.id}
                className={`text-sm p-2.5 rounded-lg border ${
                  a.level === "critical" ? "bg-red-500/5 border-red-500/30" :
                  a.level === "warn" ? "bg-yellow-500/5 border-yellow-500/30" :
                  "bg-white/[0.02] border-white/5"
                }`}
              >
                <div className="font-medium">{a.title}</div>
                {a.detail && <div className="text-xs text-slate-400 mt-1">{a.detail}</div>}
                <div className="text-[10px] text-slate-500 mt-1">{new Date(a.createdAt).toLocaleString("ar-EG")}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-lg font-bold mb-3">سجل الإرسال (آخر 200)</h3>
          <div className="space-y-1 max-h-96 overflow-y-auto font-mono text-xs">
            {events.length === 0 && <div className="text-sm text-slate-500">لا توجد أحداث</div>}
            {events.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                  e.kind === "send" ? "bg-emerald-500/10 text-emerald-400" :
                  e.kind === "failure" ? "bg-red-500/10 text-red-400" :
                  e.kind === "cooldown" ? "bg-orange-500/10 text-orange-400" :
                  e.kind === "kill" ? "bg-red-700/20 text-red-500" :
                  "bg-white/5 text-slate-400"
                }`}>{e.kind}</span>
                <span className="text-slate-500 truncate flex-1">{e.phone || "—"}</span>
                {typeof e.riskScore === "number" && (
                  <span className="text-slate-400">r:{e.riskScore}</span>
                )}
                <span className="text-slate-600">{new Date(e.createdAt).toLocaleTimeString("ar-EG", { hour12: false })}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-lg font-bold mb-3">الحدود الحالية للمرحلة</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><div className="text-slate-500">يومي</div><div className="font-bold text-lg">{limits.maxDaily}</div></div>
          <div><div className="text-slate-500">في الساعة</div><div className="font-bold text-lg">{limits.maxHourly}</div></div>
          <div><div className="text-slate-500">عملاء جدد / 10د</div><div className="font-bold text-lg">{limits.maxNewChats10Min}</div></div>
          <div><div className="text-slate-500">رد فقط؟</div><div className="font-bold text-lg">{limits.replyOnly ? "نعم" : "لا"}</div></div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-400 flex items-center gap-1.5 mb-2">{icon}{title}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, tone = "ok", extra }: { label: string; value: number; tone?: "ok" | "warn" | "danger"; extra?: string }) {
  const color = tone === "danger" ? "text-red-400" : tone === "warn" ? "text-yellow-400" : "text-white";
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>
        {value}
        {extra && <span className="text-xs text-slate-500 font-normal mr-2">{extra}</span>}
      </div>
    </div>
  );
}
