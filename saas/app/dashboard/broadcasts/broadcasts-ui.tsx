"use client";

import { useEffect, useState } from "react";
import {
  Megaphone, Send, Users, Flame, Loader2, X, StopCircle,
  CheckCircle2, AlertCircle, Clock, Sparkles, Trash2,
} from "lucide-react";

type Bc = {
  id: string;
  title: string;
  template: string;
  audience: string;
  personalize: boolean;
  status: "queued" | "sending" | "done" | "canceled";
  total: number;
  sent: number;
  failed: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

const POLL_MS = 5000;

const AUDIENCE_LABEL: Record<string, string> = {
  all: "كل العملاء",
  hot: "العملاء الساخنون (70+)",
  warm: "العملاء الدافئون (40-69)",
};

const STATUS_BADGE: Record<string, { label: string; cls: string; icon: any }> = {
  queued:   { label: "في الانتظار", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30", icon: Clock },
  sending:  { label: "جاري الإرسال", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30", icon: Loader2 },
  done:     { label: "مكتمل", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
  canceled: { label: "ملغى", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30", icon: AlertCircle },
};

export default function BroadcastsUi() {
  const [items, setItems] = useState<Bc[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState("");
  const [audience, setAudience] = useState("all");
  // Default OFF = "exact" mode. Merchant must opt-in to AI rewording so the
  // platform never silently changes the message they typed.
  const [personalize, setPersonalize] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/broadcasts", { cache: "no-store" });
      const j = await r.json();
      setItems(j.items || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  async function submit() {
    if (!template.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "حملة بدون عنوان",
          template: template.trim(),
          audience,
          personalize,
        }),
      });
      const j = await r.json();
      if (r.ok) {
        setCreating(false);
        setTitle(""); setTemplate(""); setAudience("all"); setPersonalize(false);
        if (typeof j.skipped === "number" && j.skipped > 0) {
          alert(`تم إنشاء الحملة. تم استثناء ${j.skipped} عميل لا نملك رقم هاتف لهم (معرّف واتساب فقط).`);
        }
        load();
      } else {
        alert(j.error || "فشل إنشاء الحملة");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(bc: Bc) {
    if (!confirm("إيقاف الحملة؟ الرسائل المرسلة لن تتراجع.")) return;
    await fetch(`/api/broadcasts/${bc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    load();
  }

  async function remove(bc: Bc) {
    if (!confirm("حذف الحملة وكل سجلاتها؟")) return;
    await fetch(`/api/broadcasts/${bc.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-rose-400" />
            الإرسال الجماعي
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            ابعت رسالة لكل عملائك (أو شريحة محددة) — البوت يـ personalize كل رسالة، ويرسل تدريجياً لتفادي حظر واتس.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white inline-flex items-center gap-2 text-sm"
        >
          <Megaphone className="w-4 h-4" />
          حملة جديدة
        </button>
      </div>

      {/* List */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        {loading && <div className="p-8 text-center text-slate-400 text-sm">جاري التحميل...</div>}
        {!loading && items.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-sm">
            <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <div>لا توجد حملات بعد.</div>
            <div className="text-xs mt-1">ابدأ حملة جديدة من الزر أعلاه.</div>
          </div>
        )}
        {!loading && items.map((bc) => {
          const badge = STATUS_BADGE[bc.status] || STATUS_BADGE.queued;
          const Icon = badge.icon;
          const progress = bc.total > 0 ? Math.round(((bc.sent + bc.failed) / bc.total) * 100) : 0;
          return (
            <div key={bc.id} className="border-b border-white/5 p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="font-semibold">{bc.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-md inline-flex items-center gap-1 border ${badge.cls}`}>
                    <Icon className={`w-3 h-3 ${bc.status === "sending" ? "animate-spin" : ""}`} />
                    {badge.label}
                  </span>
                  <span className="text-xs text-slate-400 inline-flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {AUDIENCE_LABEL[bc.audience] || bc.audience}
                  </span>
                  {bc.personalize && (
                    <span className="text-xs text-purple-300 inline-flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      شخصي
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 line-clamp-2 mb-2">{bc.template}</div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex-1 max-w-md">
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-all"
                           style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <span className="text-slate-300 font-mono">
                    {bc.sent + bc.failed}/{bc.total}
                  </span>
                  {bc.failed > 0 && (
                    <span className="text-rose-300">
                      ({bc.failed} فشل)
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {(bc.status === "queued" || bc.status === "sending") && (
                  <button
                    onClick={() => cancel(bc)}
                    className="px-2.5 py-1 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs inline-flex items-center gap-1"
                  >
                    <StopCircle className="w-3 h-3" />
                    إيقاف
                  </button>
                )}
                {(bc.status === "done" || bc.status === "canceled") && (
                  <button
                    onClick={() => remove(bc)}
                    className="p-1.5 rounded-md text-rose-300 hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create modal */}
      {creating && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-rose-400" />
                حملة جديدة
              </h3>
              <button onClick={() => setCreating(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">عنوان (داخلي للمتابعة فقط)</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: عرض اليوم الوطني"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">
                  الجمهور المستهدف
                </label>
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
                >
                  <option value="all">كل العملاء</option>
                  <option value="hot">العملاء الساخنون (نقاط 70+) — الأكثر استعداداً للشراء</option>
                  <option value="warm">العملاء الدافئون (نقاط 40-69)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">
                  نص الرسالة (يدعم <code dir="ltr" className="text-purple-300">{"{name}"}</code> لاسم العميل)
                </label>
                <textarea
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  rows={6}
                  placeholder={"مرحباً {name}،\nعندنا عرض جديد على المنتجات الفاخرة هذا الأسبوع — خصم 25% لمدة محدودة.\nراسلنا لو حابب التفاصيل."}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 resize-none"
                />
                <div className="text-[11px] text-slate-500 mt-1">
                  {template.length}/4000 حرف
                </div>
              </div>

              <div className="space-y-2">
                <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-lg border ${!personalize ? "bg-emerald-500/10 border-emerald-500/30" : "bg-white/5 border-white/10"}`}>
                  <input
                    type="radio"
                    name="sendMode"
                    checked={!personalize}
                    onChange={() => setPersonalize(false)}
                    className="mt-0.5 w-4 h-4 accent-emerald-500"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">✅ الوضع الآمن — إرسال النص حرفياً</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      كل العملاء يحصلون على نفس الرسالة بالضبط كما كتبتها (مع استبدال {"{name}"} و {"{phone}"} فقط).
                    </div>
                  </div>
                </label>
                <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-lg border ${personalize ? "bg-purple-500/10 border-purple-500/30" : "bg-white/5 border-white/10"}`}>
                  <input
                    type="radio"
                    name="sendMode"
                    checked={personalize}
                    onChange={() => setPersonalize(true)}
                    className="mt-0.5 w-4 h-4 accent-purple-500"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      شخصنة بالذكاء الاصطناعي
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      البوت يعيد صياغة كل رسالة بنبرة طبيعية. الأرقام والأسعار مضمونة، وأي صياغة منحرفة تُرفض تلقائياً ويُرسل النص الأصلي بدلاً منها.
                    </div>
                  </div>
                </label>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs">
                <strong className="text-amber-200">⚠️ ملاحظة هامة:</strong>
                <p className="text-slate-300 mt-1">
                  الإرسال يتم تدريجياً (1 كل 2.5 ثانية) لحماية رقم الواتس من الحظر.
                  100 عميل = حوالي 5 دقائق. 500 عميل = حوالي 25 دقيقة.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setCreating(false)}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"
              >
                إلغاء
              </button>
              <button
                onClick={submit}
                disabled={submitting || !template.trim()}
                className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-sm inline-flex items-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                إطلاق الحملة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
