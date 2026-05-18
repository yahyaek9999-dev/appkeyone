"use client";

import { useEffect, useState } from "react";
import { Clock, Save, Loader2, Bell, Flame, AlertTriangle, Sunrise } from "lucide-react";

type Slot = { day: number; from: string; to: string; enabled: boolean };

const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function defaultSlots(): Slot[] {
  return DAYS.map((_, i) => ({
    day: i,
    from: "10:00",
    to: "23:00",
    enabled: i !== 5, // Friday off by default in MENA
  }));
}

export default function WorkingHoursUi() {
  const [enabled, setEnabled] = useState(false);
  const [slots, setSlots] = useState<Slot[]>(defaultSlots());
  const [oooMsg, setOooMsg] = useState("");
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [followUpsEnabled, setFollowUpsEnabled] = useState(true);
  const [followUpHours, setFollowUpHours] = useState(24);
  const [dailyReportEnabled, setDailyReportEnabled] = useState(true);
  const [dailyReportHour, setDailyReportHour] = useState(9);
  const [timezone, setTimezone] = useState("Africa/Cairo");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/working-hours", { cache: "no-store" });
        const j = await r.json();
        setEnabled(!!j.enabled);
        if (Array.isArray(j.slots) && j.slots.length === 7) setSlots(j.slots);
        setOooMsg(j.outOfHoursMessage || "");
        setAlertEnabled(j.alertEnabled !== false);
        setFollowUpsEnabled(j.followUpsEnabled !== false);
        setFollowUpHours(j.followUpHours || 24);
        setDailyReportEnabled(j.dailyReportEnabled !== false);
        setDailyReportHour(typeof j.dailyReportHour === "number" ? j.dailyReportHour : 9);
        if (typeof j.timezone === "string" && j.timezone) setTimezone(j.timezone);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function updateSlot(day: number, patch: Partial<Slot>) {
    setSlots((arr) => arr.map((s) => s.day === day ? { ...s, ...patch } : s));
  }

  async function save() {
    setSaving(true); setSaved(false);
    try {
      await fetch("/api/working-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          slots,
          outOfHoursMessage: oooMsg,
          alertEnabled,
          followUpsEnabled,
          followUpHours,
          dailyReportEnabled,
          dailyReportHour,
          timezone,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-slate-400">جاري التحميل...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="w-6 h-6 text-sky-400" />
          ساعات العمل والذكاء التشغيلي
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          تحكم في متى يرد البوت، ومتى يبعث رسالة "خارج الدوام"، وفي تنبيهات العملاء الغاضبين، والمتابعة التلقائية.
        </p>
      </div>

      {/* Timezone — applies to working hours + daily report scheduling */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <h3 className="font-semibold mb-2">المنطقة الزمنية</h3>
        <p className="text-xs text-slate-400 mb-3">
          كل توقيت يومي (ساعات العمل، التقرير اليومي) محسوب بناءً عليها. غيّرها لو نشاطك خارج القاهرة.
        </p>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm w-full max-w-xs"
        >
          <option value="Africa/Cairo">القاهرة (Africa/Cairo)</option>
          <option value="Asia/Riyadh">الرياض (Asia/Riyadh)</option>
          <option value="Asia/Dubai">دبي (Asia/Dubai)</option>
          <option value="Asia/Amman">عمّان (Asia/Amman)</option>
          <option value="Asia/Beirut">بيروت (Asia/Beirut)</option>
          <option value="Asia/Baghdad">بغداد (Asia/Baghdad)</option>
          <option value="Asia/Kuwait">الكويت (Asia/Kuwait)</option>
          <option value="Asia/Qatar">قطر (Asia/Qatar)</option>
          <option value="Africa/Casablanca">الدار البيضاء (Africa/Casablanca)</option>
          <option value="Africa/Algiers">الجزائر (Africa/Algiers)</option>
          <option value="Africa/Tunis">تونس (Africa/Tunis)</option>
          <option value="Africa/Tripoli">طرابلس (Africa/Tripoli)</option>
          <option value="Africa/Khartoum">الخرطوم (Africa/Khartoum)</option>
          <option value="Europe/Istanbul">إسطنبول (Europe/Istanbul)</option>
          <option value="UTC">UTC</option>
        </select>
      </div>

      {/* Working hours */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">ساعات العمل</h3>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="sr-only"
            />
            <div className={`w-10 h-5 rounded-full transition relative ${enabled ? "bg-brand-500" : "bg-white/10"}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition ${enabled ? "right-0.5" : "right-5"}`} />
            </div>
            <span className="text-xs">{enabled ? "مفعّل" : "متوقف"}</span>
          </label>
        </div>

        {enabled && (
          <>
            <div className="space-y-2">
              {slots.map((s) => (
                <div key={s.day} className="flex items-center gap-3 p-2 bg-white/[0.02] rounded-lg">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={(e) => updateSlot(s.day, { enabled: e.target.checked })}
                    className="w-4 h-4 accent-brand-500"
                  />
                  <span className="w-20 text-sm">{DAYS[s.day]}</span>
                  <span className="text-xs text-slate-400">من</span>
                  <input
                    type="time"
                    value={s.from}
                    disabled={!s.enabled}
                    onChange={(e) => updateSlot(s.day, { from: e.target.value })}
                    className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm disabled:opacity-50"
                  />
                  <span className="text-xs text-slate-400">إلى</span>
                  <input
                    type="time"
                    value={s.to}
                    disabled={!s.enabled}
                    onChange={(e) => updateSlot(s.day, { to: e.target.value })}
                    className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm disabled:opacity-50"
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">رسالة "خارج الدوام"</label>
              <textarea
                value={oooMsg}
                onChange={(e) => setOooMsg(e.target.value)}
                rows={2}
                placeholder="شكراً لتواصلك! فريقنا متاح من 10ص إلى 11م. هنرد عليك أول ما نرجع."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 resize-none"
              />
            </div>
          </>
        )}
      </div>

      {/* Anger alerts */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              تنبيهات العملاء الغاضبين
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              لو رصد البوت رسالة بنبرة غاضبة أو سلبية، ترسل لك تنبيه واتساب فوراً على رقم الإشعارات.
            </p>
          </div>
          <Toggle on={alertEnabled} onChange={setAlertEnabled} />
        </div>
      </div>

      {/* Smart follow-ups */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400" />
              المتابعة الذكية
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              لو سأل عميل عن سعر/منتج ولم يكمل، البوت يبعت له رسالة متابعة بعد عدد من الساعات تختاره.
            </p>
          </div>
          <Toggle on={followUpsEnabled} onChange={setFollowUpsEnabled} />
        </div>
        {followUpsEnabled && (
          <div className="flex items-center gap-3">
            <label className="text-sm">إرسال المتابعة بعد:</label>
            <input
              type="number"
              min={1}
              max={168}
              value={followUpHours}
              onChange={(e) => setFollowUpHours(Math.max(1, Math.min(168, parseInt(e.target.value) || 24)))}
              className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm"
            />
            <span className="text-sm text-slate-400">ساعة</span>
          </div>
        )}
      </div>

      {/* Daily AI Business Report */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Sunrise className="w-4 h-4 text-amber-400" />
              التقرير اليومي على واتساب
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              ملخص يومي قصير يصلك على واتساب: عدد الرسائل، الطلبات، العملاء المحتملين، وتوصية اليوم.
            </p>
          </div>
          <Toggle on={dailyReportEnabled} onChange={setDailyReportEnabled} />
        </div>
        {dailyReportEnabled && (
          <div className="flex items-center gap-3">
            <label className="text-sm">يصلك في الساعة:</label>
            <select
              value={dailyReportHour}
              onChange={(e) => setDailyReportHour(parseInt(e.target.value, 10))}
              className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm"
            >
              {Array.from({ length: 24 }).map((_, h) => (
                <option key={h} value={h}>
                  {h === 0 ? "12 منتصف الليل" : h === 12 ? "12 ظهراً" : h < 12 ? `${h} ص` : `${h - 12} م`}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500">(بتوقيت {timezone})</span>
          </div>
        )}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white inline-flex items-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saved ? "تم الحفظ ✓" : "حفظ التغييرات"}
      </button>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`w-10 h-5 rounded-full transition relative shrink-0 ${on ? "bg-brand-500" : "bg-white/10"}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition ${on ? "right-0.5" : "right-5"}`} />
    </button>
  );
}
