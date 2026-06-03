"use client";

import { useState } from "react";

interface Initial {
  orderExtractionEnabled: boolean;
  orderConfidenceThreshold: number;
  orderRequireProduct: boolean;
  orderRequireConfirmation: boolean;
  businessMode: string;
}

export function OrderSettingsForm({ initial }: { initial: Initial }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/settings/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "خطأ في الحفظ");
      setMsg({ ok: true, text: "تم الحفظ بنجاح" });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  }

  const toggle = (k: keyof Initial) =>
    setForm(f => ({ ...f, [k]: !f[k] }));

  return (
    <div className="space-y-6">
      {/* Business mode */}
      <div>
        <label className="block text-sm font-medium mb-2">نوع النشاط التجاري</label>
        <select
          value={form.businessMode}
          onChange={e => setForm(f => ({ ...f, businessMode: e.target.value }))}
          className="input w-full max-w-xs"
        >
          <option value="store">متجر منتجات (Shopify, WooCommerce, Salla...)</option>
          <option value="restaurant">مطعم</option>
          <option value="services">خدمات (وكالة، عيادة، استشارات، عقارات...)</option>
          <option value="real_estate">عقارات</option>
          <option value="custom">مخصص</option>
        </select>
        {(form.businessMode === "services" || form.businessMode === "real_estate") && (
          <p className="text-xs text-amber-400 mt-1">
            للأنشطة الخدمية: يُنصح بتعطيل استخراج الطلبات التلقائي واستخدام العملاء المحتملين بدلاً منه.
          </p>
        )}
      </div>

      {/* Master toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-white/10">
        <div>
          <div className="font-medium">استخراج الطلبات تلقائياً</div>
          <div className="text-xs text-slate-400 mt-0.5">استخراج الطلبات من المحادثات بدون تدخل يدوي</div>
        </div>
        <button
          onClick={() => toggle("orderExtractionEnabled")}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.orderExtractionEnabled ? "bg-brand-500" : "bg-white/20"}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.orderExtractionEnabled ? "-translate-x-6" : "-translate-x-1"}`} />
        </button>
      </div>

      {form.orderExtractionEnabled && (
        <div className="space-y-4 pl-2 border-r-2 border-white/10 pr-4">
          {/* Confidence threshold */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">حد الثقة الأدنى</label>
              <span className="text-sm font-bold text-brand-300">{form.orderConfidenceThreshold}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={90}
              step={5}
              value={form.orderConfidenceThreshold}
              onChange={e => setForm(f => ({ ...f, orderConfidenceThreshold: Number(e.target.value) }))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-0.5">
              <span>20% (أكثر طلبات)</span>
              <span>90% (دقة عالية)</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {form.orderConfidenceThreshold < 40
                ? "⚠️ قد يُنشئ طلبات وهمية من محادثات عادية"
                : form.orderConfidenceThreshold >= 70
                  ? "✓ دقة عالية — فقط محادثات واضحة جداً"
                  : "توازن بين الدقة والشمولية"}
            </p>
          </div>

          {/* Require product */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-white/10">
            <div>
              <div className="text-sm font-medium">يتطلب ذكر منتج</div>
              <div className="text-xs text-slate-400">لا يُنشئ طلباً إلا إذا ذُكر اسم منتج صريح</div>
            </div>
            <button
              onClick={() => toggle("orderRequireProduct")}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.orderRequireProduct ? "bg-brand-500" : "bg-white/20"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.orderRequireProduct ? "-translate-x-6" : "-translate-x-1"}`} />
            </button>
          </div>

          {/* Require confirmation */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-white/10">
            <div>
              <div className="text-sm font-medium">يتطلب تأكيد العميل</div>
              <div className="text-xs text-slate-400">فقط عند قول العميل: تمام، موافق، ايوه، اوكي...</div>
            </div>
            <button
              onClick={() => toggle("orderRequireConfirmation")}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.orderRequireConfirmation ? "bg-brand-500" : "bg-white/20"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.orderRequireConfirmation ? "-translate-x-6" : "-translate-x-1"}`} />
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className={`text-sm ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>{msg.text}</p>
      )}

      <button onClick={save} disabled={saving} className="btn-primary px-6">
        {saving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
      </button>
    </div>
  );
}
