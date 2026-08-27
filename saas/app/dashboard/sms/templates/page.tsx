"use client";

import { useState, useEffect } from "react";
import { useMutate } from "@/components/ui/use-mutate";
import { Plus, Trash2, Edit2 } from "lucide-react";

type Template = {
  id: string;
  name: string;
  purpose: string;
  body: string;
  language: string;
  enabled: boolean;
  charCount: number;
  segCount: number;
  sendCount: number;
};

const PURPOSES = [
  { value: "order_confirmation", label: "تأكيد الطلب" },
  { value: "order_status", label: "تحديث حالة الطلب" },
  { value: "otp", label: "OTP / رمز التحقق" },
  { value: "shipping", label: "الشحن والتتبع" },
  { value: "custom", label: "مخصص" },
];

const purposeLabel = (p: string) => PURPOSES.find(x => x.value === p)?.label ?? p;

function countSms(body: string) {
  const len = body.length;
  const segs = len <= 160 ? 1 : Math.ceil(len / 153);
  return { charCount: len, segCount: segs };
}

const emptyForm = { name: "", purpose: "custom", body: "", language: "ar" };

export default function SmsTemplatesPage() {
  const mutate = useMutate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("all");

  async function load() {
    setLoading(true);
    const url = filter !== "all" ? `/api/sms/templates?purpose=${filter}` : "/api/sms/templates";
    const res = await fetch(url);
    const d = await res.json();
    setTemplates(d.templates ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [filter]);

  async function save() {
    const { charCount, segCount } = countSms(form.body);
    const payload = { ...form, charCount, segCount };
    if (editId) {
      if (!(await mutate(`/api/sms/templates/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }))) return;
    } else {
      if (!(await mutate("/api/sms/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }))) return;
    }
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm);
    load();
  }

  function startEdit(t: Template) {
    setForm({ name: t.name, purpose: t.purpose, body: t.body, language: t.language });
    setEditId(t.id);
    setShowForm(true);
  }

  async function del(id: string) {
    if (!confirm("حذف القالب؟")) return;
    if (!(await mutate(`/api/sms/templates/${id}`, { method: "DELETE" }))) return;
    load();
  }

  const { charCount, segCount } = countSms(form.body);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.05] pb-5">
        <div>
          <h1 className="page-title mb-1">قوالب SMS</h1>
          <p className="page-desc">رسائل الطلبات، التأكيد، الحالة، OTP</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm); }} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="h-4 w-4" /> قالب جديد
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {[{ value: "all", label: "الكل" }, ...PURPOSES].map(p => (
          <button key={p.value} onClick={() => setFilter(p.value)} className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${filter === p.value ? "bg-brand-500 text-white" : "bg-white/5 text-slate-400 hover:text-white"}`}>{p.label}</button>
        ))}
      </div>

      {showForm && (
        <div className="rounded-xl border border-white/10 bg-canvas-raised p-5 space-y-4">
          <h2 className="font-semibold text-white">{editId ? "تعديل القالب" : "قالب جديد"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-sm mb-1 block">اسم القالب</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input w-full text-sm" placeholder="تأكيد الطلب AR" />
            </div>
            <div>
              <label className="label-sm mb-1 block">الغرض</label>
              <select value={form.purpose} onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))} className="input w-full text-sm">
                {PURPOSES.map(pp => <option key={pp.value} value={pp.value}>{pp.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label-sm mb-1 block">اللغة</label>
              <select value={form.language} onChange={e => setForm(p => ({ ...p, language: e.target.value }))} className="input w-full text-sm">
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label-sm mb-1 block">نص الرسالة</label>
            <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} className="input w-full text-sm min-h-[100px] font-mono" placeholder="مرحباً {{name}}، طلبك #{{orderId}} تم تأكيده." />
            <p className="mt-1 text-xs text-slate-500">{charCount} حرف · {segCount} رسالة · متغيرات: {'{{name}}'} {'{{orderId}}'} {'{{status}}'}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="btn-primary text-sm">حفظ</button>
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="btn-ghost text-sm">إلغاء</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-slate-500 py-8">جاري التحميل...</p>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
          <p className="text-slate-400">لا توجد قوالب. أنشئ أول قالب للبدء.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <div key={t.id} className="rounded-xl border border-white/[0.07] bg-canvas-raised p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-medium text-white">{t.name}</span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-400">{purposeLabel(t.purpose)}</span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-400">{t.language}</span>
                    {!t.enabled && <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-400">معطّل</span>}
                  </div>
                  <p className="text-sm text-slate-400 font-mono truncate">{t.body.slice(0, 80)}{t.body.length > 80 ? "..." : ""}</p>
                  <p className="text-xs text-slate-600 mt-1">{t.charCount} حرف · {t.segCount} رسالة · أُرسل {t.sendCount} مرة</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(t)} className="p-2 text-slate-500 hover:text-white"><Edit2 className="h-4 w-4" /></button>
                  <button onClick={() => del(t.id)} className="p-2 text-slate-600 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
