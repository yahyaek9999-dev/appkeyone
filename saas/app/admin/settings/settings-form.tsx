"use client";

import { useState } from "react";
import { Save, MessageCircle, Mail, Building2 } from "lucide-react";

type Initial = {
  brandName: string;
  brandTagline: string;
  supportWhatsapp: string;
  supportEmail: string;
  paymentNote: string;
};

export default function SettingsForm({ initial }: { initial: Initial }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.error || "فشل الحفظ");
      }
      setMsg({ type: "ok", text: "تم الحفظ بنجاح" });
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-slate-300">
          <Building2 className="w-4 h-4" /> <span className="font-medium">معلومات البراند</span>
        </div>
        <div>
          <label className="text-sm text-slate-400 mb-1 block">اسم البراند</label>
          <input value={form.brandName} onChange={(e) => setForm({ ...form, brandName: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none" />
        </div>
        <div>
          <label className="text-sm text-slate-400 mb-1 block">الشعار الفرعي</label>
          <input value={form.brandTagline} onChange={(e) => setForm({ ...form, brandTagline: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none" />
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-slate-300">
          <MessageCircle className="w-4 h-4" /> <span className="font-medium">قنوات التواصل</span>
        </div>
        <div>
          <label className="text-sm text-slate-400 mb-1 block">رقم واتساب الدعم (للاشتراكات)</label>
          <input value={form.supportWhatsapp} onChange={(e) => setForm({ ...form, supportWhatsapp: e.target.value })} placeholder="+201012345678" dir="ltr" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none" />
          <p className="text-xs text-slate-500 mt-1">سيظهر للعملاء في صفحة الأسعار وعند انتهاء الاشتراك.</p>
        </div>
        <div>
          <label className="text-sm text-slate-400 mb-1 block">البريد الإلكتروني</label>
          <input value={form.supportEmail} onChange={(e) => setForm({ ...form, supportEmail: e.target.value })} placeholder="support@example.com" dir="ltr" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none" />
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-slate-300">
          <Mail className="w-4 h-4" /> <span className="font-medium">رسالة الدفع للعملاء</span>
        </div>
        <textarea
          value={form.paymentNote}
          onChange={(e) => setForm({ ...form, paymentNote: e.target.value })}
          rows={4}
          placeholder="مثال: للدفع عبر فودافون كاش 01xxxxxxxx، أو إنستاباي username@instapay"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none resize-y"
        />
        <p className="text-xs text-slate-500">تظهر للعملاء عند الاستفسار عن الدفع.</p>
      </div>

      {msg && (
        <div className={`p-3 rounded-xl border text-sm ${msg.type === "ok" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200" : "bg-rose-500/10 border-rose-500/30 text-rose-200"}`}>
          {msg.text}
        </div>
      )}

      <button onClick={save} disabled={saving} className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 rounded-xl py-2.5 px-6 font-medium inline-flex items-center gap-2">
        <Save className="w-4 h-4" /> {saving ? "جاري الحفظ..." : "حفظ التغييرات"}
      </button>
    </div>
  );
}
