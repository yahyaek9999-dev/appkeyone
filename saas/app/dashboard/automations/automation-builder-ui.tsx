"use client";

import { useEffect, useState } from "react";
import {
  Zap, Plus, Save, Trash2, ToggleLeft, ToggleRight,
  Loader2, X, ChevronDown, ShoppingBag, CreditCard,
  Truck, Package, MessageSquare, Mail, BarChart3, Bot,
} from "lucide-react";

// ── Event + Channel meta ─────────────────────────────────────────────────────

const EVENT_META: Record<string, { label: string; icon: typeof ShoppingBag; desc: string }> = {
  "order.created":          { label: "طلب جديد",             icon: ShoppingBag, desc: "عند إنشاء طلب جديد" },
  "order.confirmed":        { label: "طلب مؤكد",             icon: ShoppingBag, desc: "عند تأكيد الطلب" },
  "order.preparing":        { label: "قيد التحضير",          icon: Package,     desc: "عند بدء تحضير الطلب" },
  "order.shipped":          { label: "تم الشحن",              icon: Truck,       desc: "عند شحن الطلب" },
  "order.out_for_delivery": { label: "في الطريق",             icon: Truck,       desc: "خرج للتوصيل" },
  "order.delivered":        { label: "تم التسليم",            icon: Package,     desc: "عند تسليم الطلب" },
  "order.cancelled":        { label: "طلب ملغي",             icon: X,           desc: "عند إلغاء الطلب" },
  "payment.failed":         { label: "فشل الدفع",            icon: CreditCard,  desc: "عند فشل عملية الدفع" },
  "customer.created":       { label: "عميل جديد",            icon: MessageSquare, desc: "عند تسجيل عميل جديد" },
};

const CHANNEL_META: Record<string, { label: string; icon: typeof MessageSquare; color: string }> = {
  whatsapp:    { label: "واتساب",      icon: MessageSquare, color: "text-brand-400" },
  email:       { label: "بريد إلكتروني", icon: Mail,        color: "text-blue-400" },
  ai_followup: { label: "متابعة ذكية", icon: Bot,          color: "text-purple-400" },
  analytics:   { label: "تحليلات",     icon: BarChart3,    color: "text-amber-400" },
};

const EVENTS = Object.keys(EVENT_META);
const CHANNELS = ["whatsapp", "email", "ai_followup"];

// ── Default templates ─────────────────────────────────────────────────────────

const DEFAULT_TEMPLATES: Record<string, Record<string, string>> = {
  "order.created":   { whatsapp: "أهلاً {customerName}! تم استلام طلبك رقم {orderId} بنجاح. سنبدأ تحضيره قريباً. 🛍️" },
  "order.confirmed": { whatsapp: "طلبك رقم {orderId} تم تأكيده ✅ وسيُشحن في أقرب وقت." },
  "order.shipped":   { whatsapp: "طلبك رقم {orderId} في الطريق إليك! 🚚 كود التتبع: {trackingCode}" },
  "order.delivered": { whatsapp: "تم التسليم ✅ شكراً لطلبك! نتمنى أن تكون راضياً عن {brandName}." },
  "order.cancelled": { whatsapp: "أُلغي طلبك رقم {orderId}. للاستفسار تواصل معنا على واتساب." },
  "payment.failed":  { whatsapp: "لم تتم عملية الدفع لطلبك رقم {orderId}. يرجى المحاولة مجدداً." },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface Automation {
  id: string;
  eventType: string;
  channel: string;
  enabled: boolean;
  subject: string;
  template: string;
  throttleSeconds: number;
  integrationId: string | null;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AutomationBuilderUi() {
  const [items, setItems] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newEvent, setNewEvent] = useState(EVENTS[0]);
  const [newChannel, setNewChannel] = useState(CHANNELS[0]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/commerce/automations", { cache: "no-store" });
      const j = await r.json();
      setItems(j.items || []);
    } finally { setLoading(false); }
  }

  async function toggle(item: Automation) {
    await fetch("/api/commerce/automations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, enabled: !item.enabled }),
    });
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, enabled: !i.enabled } : i));
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    const r = await fetch("/api/commerce/automations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing.id,
        subject: editing.subject,
        template: editing.template,
        throttleSeconds: editing.throttleSeconds,
      }),
    });
    setSaving(false);
    if (r.ok) {
      setItems((prev) => prev.map((i) => i.id === editing.id ? { ...i, ...editing } : i));
      setEditing(null);
      setMsg({ ok: true, text: "تم الحفظ" });
    } else {
      setMsg({ ok: false, text: "فشل الحفظ" });
    }
  }

  async function createRule() {
    const defaultTemplate = DEFAULT_TEMPLATES[newEvent]?.[newChannel] || "";
    const r = await fetch("/api/commerce/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: newEvent,
        channel: newChannel,
        enabled: false,
        template: defaultTemplate,
        subject: "",
        throttleSeconds: 300,
        integrationId: null,
      }),
    });
    if (r.ok) {
      setShowCreate(false);
      await load();
      setMsg({ ok: true, text: "تمت إضافة القاعدة — فعّلها عند الجاهزية" });
    } else {
      const j = await r.json().catch(() => ({}));
      setMsg({ ok: false, text: j.error || "فشلت الإضافة" });
    }
  }

  // Group by eventType for display
  const grouped: Record<string, Automation[]> = {};
  for (const item of items) {
    if (!grouped[item.eventType]) grouped[item.eventType] = [];
    grouped[item.eventType].push(item);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title mb-1 flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-400" />
            أتمتة التجارة
          </h1>
          <p className="page-desc">قواعد no-code تُرسِل إشعارات واتساب أو بريد إلكتروني تلقائياً عند أحداث الطلبات.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary shrink-0">
          <Plus className="h-4 w-4" /> قاعدة جديدة
        </button>
      </div>

      {msg && (
        <div className={`rounded-xl p-3 text-sm ${msg.ok ? "bg-brand-500/10 text-brand-300 border border-brand-500/20" : "bg-rose-500/10 text-rose-300 border border-rose-500/20"}`}>
          {msg.text}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="card p-12 text-center">
          <Zap className="h-12 w-12 mx-auto mb-3 text-slate-600" />
          <h3 className="font-bold mb-1">لا توجد قواعد بعد</h3>
          <p className="text-sm text-slate-400 mb-4">أضف قاعدة لإرسال إشعار واتساب تلقائي عند استقبال طلب جديد.</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="h-4 w-4" /> إضافة أول قاعدة
          </button>
        </div>
      )}

      {/* Grouped rules */}
      {!loading && Object.entries(grouped).map(([eventType, rules]) => {
        const meta = EVENT_META[eventType] || { label: eventType, icon: Zap, desc: "" };
        const EventIcon = meta.icon;
        return (
          <div key={eventType} className="card overflow-hidden">
            <div className="flex items-center gap-3 border-b border-white/[0.06] p-4">
              <EventIcon className="h-4 w-4 text-slate-400" />
              <div>
                <div className="font-semibold text-sm">{meta.label}</div>
                <div className="text-[11px] text-slate-500">{meta.desc}</div>
              </div>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {rules.map((rule) => {
                const ch = CHANNEL_META[rule.channel] || { label: rule.channel, icon: MessageSquare, color: "text-slate-400" };
                const ChIcon = ch.icon;
                return (
                  <div key={rule.id} className="flex items-center justify-between gap-3 p-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <ChIcon className={`h-4 w-4 shrink-0 ${ch.color}`} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{ch.label}</div>
                        <div className="truncate text-[11px] text-slate-500 max-w-xs">
                          {rule.template || "بدون قالب"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[11px] rounded-full px-2 py-0.5 border ${rule.enabled ? "border-brand-500/30 bg-brand-500/10 text-brand-300" : "border-slate-600 bg-slate-500/10 text-slate-500"}`}>
                        {rule.enabled ? "مفعّل" : "معطّل"}
                      </span>
                      <button onClick={() => toggle(rule)} className="text-slate-400 hover:text-white" title={rule.enabled ? "إيقاف" : "تفعيل"}>
                        {rule.enabled ? <ToggleRight className="h-5 w-5 text-brand-400" /> : <ToggleLeft className="h-5 w-5" />}
                      </button>
                      <button onClick={() => setEditing({ ...rule })} className="btn-ghost px-3 py-1.5 text-xs">
                        تعديل
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur">
          <div className="card w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">قاعدة جديدة</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div>
              <label className="label">الحدث المُشغِّل</label>
              <div className="relative">
                <select value={newEvent} onChange={(e) => setNewEvent(e.target.value)} className="input appearance-none w-full">
                  {EVENTS.map((e) => <option key={e} value={e}>{EVENT_META[e]?.label || e}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">{EVENT_META[newEvent]?.desc}</p>
            </div>
            <div>
              <label className="label">القناة</label>
              <div className="relative">
                <select value={newChannel} onChange={(e) => setNewChannel(e.target.value)} className="input appearance-none w-full">
                  {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_META[c]?.label || c}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              </div>
            </div>
            <div className="text-xs text-slate-500 p-3 rounded-xl bg-white/[0.03]">
              المتغيرات المتاحة: <span dir="ltr">{"{customerName} {orderId} {trackingCode} {brandName}"}</span>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="btn-ghost">إلغاء</button>
              <button onClick={createRule} className="btn-primary">
                <Plus className="h-4 w-4" /> إضافة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur">
          <div className="card w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">تعديل القاعدة</h2>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex gap-2">
              <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs">{EVENT_META[editing.eventType]?.label || editing.eventType}</span>
              <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs">{CHANNEL_META[editing.channel]?.label || editing.channel}</span>
            </div>
            {editing.channel === "email" && (
              <div>
                <label className="label">عنوان البريد</label>
                <input className="input" value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} placeholder="عنوان الإيميل..." />
              </div>
            )}
            <div>
              <label className="label">نص الرسالة</label>
              <textarea
                className="input min-h-[120px] resize-none text-sm font-mono"
                value={editing.template}
                onChange={(e) => setEditing({ ...editing, template: e.target.value })}
                placeholder="أدخل نص الرسالة..."
              />
              <p className="text-[11px] text-slate-500 mt-1">المتغيرات: {"{customerName} {orderId} {trackingCode} {brandName}"}</p>
            </div>
            <div>
              <label className="label">تأخير التكرار (ثانية)</label>
              <input
                type="number" min={0} max={86400}
                className="input w-32"
                value={editing.throttleSeconds}
                onChange={(e) => setEditing({ ...editing, throttleSeconds: Number(e.target.value) })}
              />
              <span className="mr-2 text-xs text-slate-500">الحد الأدنى بين رسالتين لنفس العميل</span>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="btn-ghost">إلغاء</button>
              <button onClick={saveEdit} disabled={saving} className="btn-primary">
                <Save className="h-4 w-4" />
                {saving ? "..." : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
