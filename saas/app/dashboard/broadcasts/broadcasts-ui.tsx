"use client";

import { useEffect, useState } from "react";
import {
  Megaphone,
  Send,
  Users,
  Loader2,
  X,
  StopCircle,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Trash2,
  Ticket,
  ImageIcon,
  CalendarClock,
  BarChart3,
  Wand2,
} from "lucide-react";
import { LiveBadge } from "@/components/ui/live-badge";
import { useRealtimeSnapshot } from "@/hooks/use-realtime";

type Bc = {
  id: string;
  title: string;
  template: string;
  audience: string;
  personalize: boolean;
  kind?: string;
  scheduledAt?: string | null;
  couponCode?: string | null;
  imageUrl?: string | null;
  status: "queued" | "sending" | "done" | "canceled";
  total: number;
  sent: number;
  failed: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

type Analytics = {
  total: number;
  sent: number;
  failed: number;
  replied: number;
  conversion: number;
  replyRatePct: number;
  convRatePct: number;
  delivered: number | null;
  clicked: number | null;
  note?: string;
};

const POLL_MS = 20000;

const AUDIENCE_LABEL: Record<string, string> = {
  all: "كل العملاء",
  hot: "العملاء الساخنون (70+)",
  warm: "العملاء الدافئون (40-69)",
  buyers: "عملاء اشتروا من قبل",
  no_purchase: "عملاء بدون شراء",
  inactive: "عملاء غير نشطين",
  abandoned: "عربات متروكة",
  date_range: "حسب تاريخ التسجيل",
  recovery: "استعادة عميل",
};

const GEN_TYPES: { key: string; label: string }[] = [
  { key: "offer", label: "عرض جديد" },
  { key: "discount", label: "خصم" },
  { key: "back_in_stock", label: "عاد للتوفر" },
  { key: "reminder", label: "تذكير" },
  { key: "abandoned_cart", label: "سلة متروكة" },
  { key: "seasonal", label: "موسمي" },
  { key: "upsell", label: "بيع إضافي" },
];

const STATUS_BADGE: Record<string, { label: string; cls: string; icon: any }> = {
  queued: { label: "في الانتظار", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30", icon: Clock },
  sending: { label: "جاري الإرسال", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30", icon: Loader2 },
  done: { label: "مكتمل", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
  canceled: { label: "ملغى", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30", icon: AlertCircle },
};

export default function BroadcastsUi() {
  const [items, setItems] = useState<Bc[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState("");
  const [audience, setAudience] = useState("all");
  const [personalize, setPersonalize] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ---- Smart Campaign builder state ----
  const [couponCode, setCouponCode] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [inactiveDays, setInactiveDays] = useState("30");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // ---- AI generator state ----
  const [genType, setGenType] = useState("offer");
  const [genProduct, setGenProduct] = useState("");
  const [genOffer, setGenOffer] = useState("");
  const [generating, setGenerating] = useState(false);

  // ---- Analytics expand state ----
  const [openAnalytics, setOpenAnalytics] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<Record<string, Analytics | "loading">>({});

  const { state: liveState, snapshot } = useRealtimeSnapshot({
    fallbackMs: POLL_MS,
    onChange: (next, prev) => {
      if (
        !prev ||
        prev.latest.broadcastAt !== next.latest.broadcastAt ||
        prev.totals.broadcastsActive !== next.totals.broadcastsActive
      ) {
        load();
      }
    },
  });

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

  function resetForm() {
    setTitle("");
    setTemplate("");
    setAudience("all");
    setPersonalize(false);
    setCouponCode("");
    setImageUrl("");
    setScheduleMode("now");
    setScheduledAt("");
    setInactiveDays("30");
    setDateFrom("");
    setDateTo("");
    setGenProduct("");
    setGenOffer("");
  }

  async function generate() {
    setGenerating(true);
    try {
      const r = await fetch("/api/broadcasts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: genType, product: genProduct, offer: genOffer }),
      });
      const j = await r.json();
      if (r.ok && j.text) setTemplate(j.text);
      else alert(j.error === "llm_error" ? "تعذّر توليد النص — تحقق من مزود الذكاء" : "تعذّر التوليد");
    } catch {
      alert("خطأ بالشبكة");
    } finally {
      setGenerating(false);
    }
  }

  async function submit() {
    if (!template.trim()) return;
    setSubmitting(true);
    try {
      const payload: any = {
        title: title.trim() || "حملة بدون عنوان",
        template: template.trim(),
        audience,
        personalize,
        couponCode: couponCode.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
      };
      if (scheduleMode === "later" && scheduledAt) payload.scheduledAt = new Date(scheduledAt).toISOString();
      if (audience === "inactive") payload.inactiveDays = Number(inactiveDays) || 30;
      if (audience === "date_range") {
        if (dateFrom) payload.from = new Date(dateFrom).toISOString();
        if (dateTo) payload.to = new Date(dateTo).toISOString();
      }
      const r = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (r.ok) {
        setCreating(false);
        resetForm();
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

  async function toggleAnalytics(bc: Bc) {
    if (openAnalytics === bc.id) {
      setOpenAnalytics(null);
      return;
    }
    setOpenAnalytics(bc.id);
    if (!analytics[bc.id]) {
      setAnalytics((a) => ({ ...a, [bc.id]: "loading" }));
      try {
        const r = await fetch(`/api/broadcasts/${bc.id}/analytics`, { cache: "no-store" });
        const j = await r.json();
        setAnalytics((a) => ({ ...a, [bc.id]: j }));
      } catch {
        setAnalytics((a) => {
          const next = { ...a };
          delete next[bc.id];
          return next;
        });
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-rose-400" />
            حملات البث الذكية
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            استهدف شريحة من عملائك، ولّد النص بالذكاء الاصطناعي، أرفق كوبون أو صورة، وجدول الإرسال — كله يُرسل تدريجياً عبر نفس نظام الحماية.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LiveBadge
            state={liveState}
            label={
              (snapshot?.totals.broadcastsActive || 0) > 0
                ? `${snapshot?.totals.broadcastsActive} حملات نشطة`
                : undefined
            }
          />
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white inline-flex items-center gap-2 text-sm"
          >
            <Megaphone className="w-4 h-4" />
            حملة جديدة
          </button>
        </div>
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
        {!loading &&
          items.map((bc) => {
            const badge = STATUS_BADGE[bc.status] || STATUS_BADGE.queued;
            const Icon = badge.icon;
            const progress = bc.total > 0 ? Math.round(((bc.sent + bc.failed) / bc.total) * 100) : 0;
            const an = analytics[bc.id];
            return (
              <div key={bc.id} className="border-b border-white/5 p-4">
                <div className="flex items-start justify-between gap-4">
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
                      {bc.scheduledAt && (
                        <span className="text-xs text-amber-300 inline-flex items-center gap-1">
                          <CalendarClock className="w-3 h-3" />
                          {new Date(bc.scheduledAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      )}
                      {bc.couponCode && (
                        <span className="text-xs text-emerald-300 inline-flex items-center gap-1">
                          <Ticket className="w-3 h-3" />
                          {bc.couponCode}
                        </span>
                      )}
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
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-slate-300 font-mono">
                        {bc.sent + bc.failed}/{bc.total}
                      </span>
                      {bc.failed > 0 && <span className="text-rose-300">({bc.failed} فشل)</span>}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => toggleAnalytics(bc)}
                      title="تحليلات الحملة"
                      className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-slate-300 text-xs inline-flex items-center gap-1 hover:bg-white/10"
                    >
                      <BarChart3 className="w-3 h-3" />
                      تحليلات
                    </button>
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
                      <button onClick={() => remove(bc)} className="p-1.5 rounded-md text-rose-300 hover:bg-rose-500/10">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Analytics panel */}
                {openAnalytics === bc.id && (
                  <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    {an === "loading" || !an ? (
                      <div className="text-xs text-slate-400 py-2 text-center">
                        <Loader2 className="w-4 h-4 animate-spin inline-block me-1" /> جاري حساب التحليلات...
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                          <Metric label="أُرسلت" value={an.sent} />
                          <Metric label="فشل" value={an.failed} tone="text-rose-300" />
                          <Metric label="ردّوا" value={an.replied} tone="text-sky-300" sub={`${an.replyRatePct}%`} />
                          <Metric label="تحويل" value={an.conversion} tone="text-emerald-300" sub={`${an.convRatePct}%`} />
                          <Metric label="تم التسليم" value="—" tone="text-slate-500" />
                          <Metric label="نقرات" value="—" tone="text-slate-500" />
                        </div>
                        <div className="text-[11px] text-slate-500 mt-2">{an.note}</div>
                      </>
                    )}
                  </div>
                )}
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
                <label className="text-xs text-slate-400 mb-1 block">الجمهور المستهدف</label>
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
                >
                  <option value="all">كل العملاء</option>
                  <option value="hot">العملاء الساخنون (70+) — الأكثر استعداداً للشراء</option>
                  <option value="warm">العملاء الدافئون (40-69)</option>
                  <option value="buyers">عملاء اشتروا من قبل</option>
                  <option value="no_purchase">عملاء بدون شراء</option>
                  <option value="inactive">عملاء غير نشطين</option>
                  <option value="abandoned">عربات متروكة (تردد عالي)</option>
                  <option value="date_range">حسب تاريخ التسجيل</option>
                </select>

                {audience === "inactive" && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                    غير نشط منذ
                    <input
                      type="number"
                      min={1}
                      value={inactiveDays}
                      onChange={(e) => setInactiveDays(e.target.value)}
                      className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm"
                    />
                    يوم
                  </div>
                )}
                {audience === "date_range" && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-500 mb-1 block">من</label>
                      <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 mb-1 block">إلى</label>
                      <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                )}
              </div>

              {/* AI generator */}
              <div className="rounded-lg border border-purple-500/25 bg-purple-500/[0.06] p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-purple-200 mb-2">
                  <Wand2 className="w-4 h-4" />
                  توليد النص بالذكاء الاصطناعي
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {GEN_TYPES.map((g) => (
                    <button
                      key={g.key}
                      onClick={() => setGenType(g.key)}
                      className={`px-2.5 py-1 rounded-full text-xs border ${genType === g.key ? "bg-purple-500/20 border-purple-500/40 text-purple-100" : "bg-white/5 border-white/10 text-slate-300"}`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                  <input value={genProduct} onChange={(e) => setGenProduct(e.target.value)} placeholder="المنتج/الخدمة (اختياري)" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                  <input value={genOffer} onChange={(e) => setGenOffer(e.target.value)} placeholder="تفاصيل العرض/الخصم (اختياري)" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                </div>
                <button
                  onClick={generate}
                  disabled={generating}
                  className="px-3 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-100 text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  توليد النص
                </button>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">
                  نص الرسالة (يدعم{" "}
                  <code dir="ltr" className="text-purple-300">{"{name}"}</code> لاسم العميل)
                </label>
                <textarea
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  rows={6}
                  placeholder={"مرحباً {name}،\nعندنا عرض جديد هذا الأسبوع — راسلنا لو حابب التفاصيل."}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 resize-none"
                />
                <div className="text-[11px] text-slate-500 mt-1">{template.length}/4000 حرف</div>
              </div>

              {/* Coupon + image link */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Ticket className="w-3.5 h-3.5" /> كود خصم (اختياري)</label>
                  <input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="SAVE25" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" /> رابط صورة — تظهر كمعاينة (اختياري)</label>
                  <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." dir="ltr" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              {/* Schedule */}
              <div>
                <label className="text-xs text-slate-400 mb-1 flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> توقيت الإرسال</label>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setScheduleMode("now")} className={`px-3 py-1.5 rounded-lg text-xs border ${scheduleMode === "now" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-200" : "bg-white/5 border-white/10 text-slate-300"}`}>الآن</button>
                  <button onClick={() => setScheduleMode("later")} className={`px-3 py-1.5 rounded-lg text-xs border ${scheduleMode === "later" ? "bg-amber-500/15 border-amber-500/30 text-amber-200" : "bg-white/5 border-white/10 text-slate-300"}`}>لاحقاً</button>
                  {scheduleMode === "later" && (
                    <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm" />
                  )}
                </div>
              </div>

              {/* Send mode (existing safe/personalize choice) */}
              <div className="space-y-2">
                <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-lg border ${!personalize ? "bg-emerald-500/10 border-emerald-500/30" : "bg-white/5 border-white/10"}`}>
                  <input type="radio" name="sendMode" checked={!personalize} onChange={() => setPersonalize(false)} className="mt-0.5 w-4 h-4 accent-emerald-500" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">✅ الوضع الآمن — إرسال النص حرفياً</div>
                    <div className="text-xs text-slate-400 mt-0.5">كل العملاء يحصلون على نفس الرسالة بالضبط (مع استبدال {"{name}"} و {"{phone}"} فقط).</div>
                  </div>
                </label>
                <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-lg border ${personalize ? "bg-purple-500/10 border-purple-500/30" : "bg-white/5 border-white/10"}`}>
                  <input type="radio" name="sendMode" checked={personalize} onChange={() => setPersonalize(true)} className="mt-0.5 w-4 h-4 accent-purple-500" />
                  <div className="flex-1">
                    <div className="text-sm font-medium flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-purple-400" /> شخصنة بالذكاء الاصطناعي</div>
                    <div className="text-xs text-slate-400 mt-0.5">البوت يعيد صياغة كل رسالة بنبرة طبيعية. الأرقام والأسعار مضمونة، وأي صياغة منحرفة تُرفض ويُرسل النص الأصلي. الكوبون والصورة تُضاف بعد الصياغة دائماً.</div>
                  </div>
                </label>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs">
                <strong className="text-amber-200">⚠️ ملاحظة هامة:</strong>
                <p className="text-slate-300 mt-1">الإرسال يتم تدريجياً (1 كل 2.5 ثانية) عبر نظام الحماية لحماية رقم الواتس. 100 عميل ≈ 5 دقائق. 500 عميل ≈ 25 دقيقة.</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm">إلغاء</button>
              <button
                onClick={submit}
                disabled={submitting || !template.trim() || (scheduleMode === "later" && !scheduledAt)}
                className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-sm inline-flex items-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {scheduleMode === "later" ? "جدولة الحملة" : "إطلاق الحملة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone = "text-white", sub }: { label: string; value: any; tone?: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 py-2">
      <div className={`text-lg font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}
