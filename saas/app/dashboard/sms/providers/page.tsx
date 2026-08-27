"use client";

import { useState, useEffect } from "react";
import { useMutate } from "@/components/ui/use-mutate";
import { Plus, Trash2, RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

type Provider = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  isDefault: boolean;
  health: string;
  lastTestAt?: string;
  lastTestOk?: boolean;
};

const PROVIDER_TYPES = [
  { value: "manual", label: "يدوي (بدون إرسال)" },
  { value: "unifonic", label: "Unifonic" },
  { value: "msegat", label: "Msegat" },
  { value: "custom", label: "مخصص (HTTP)" },
];

function HealthBadge({ health, ok }: { health: string; ok?: boolean | null }) {
  if (ok === true) return <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> متصل</span>;
  if (ok === false) return <span className="flex items-center gap-1 text-xs text-red-400"><XCircle className="h-3.5 w-3.5" /> خطأ</span>;
  return <span className="flex items-center gap-1 text-xs text-slate-500"><AlertCircle className="h-3.5 w-3.5" /> غير مختبر</span>;
}

export default function SmsProvidersPage() {
  const mutate = useMutate();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", type: "manual", apiKey: "", apiSecret: "", senderId: "", endpoint: "" });

  async function load() {
    setLoading(true);
    const res = await fetch("/api/sms/providers");
    const d = await res.json();
    setProviders(d.providers ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function create() {
    if (!(await mutate("/api/sms/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }))) return;
    setShowForm(false);
    setForm({ name: "", type: "manual", apiKey: "", apiSecret: "", senderId: "", endpoint: "" });
    load();
  }

  async function testProvider(id: string) {
    setTesting(id);
    if (!(await mutate(`/api/sms/providers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test" }),
    }))) return;
    await load();
    setTesting(null);
  }

  async function deleteProvider(id: string) {
    if (!confirm("حذف المزوّد؟")) return;
    if (!(await mutate(`/api/sms/providers/${id}`, { method: "DELETE" }))) return;
    load();
  }

  async function toggleDefault(id: string) {
    if (!(await mutate(`/api/sms/providers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    }))) return;
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.05] pb-5">
        <div>
          <h1 className="page-title mb-1">مزوّدو SMS</h1>
          <p className="page-desc">إدارة مزوّدي الإرسال وفحص الاتصال</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="h-4 w-4" /> إضافة مزوّد
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-white/10 bg-canvas-raised p-5 space-y-4">
          <h2 className="font-semibold text-white">مزوّد جديد</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-sm mb-1 block">الاسم</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input w-full text-sm" placeholder="مزوّدي الرئيسي" />
            </div>
            <div>
              <label className="label-sm mb-1 block">النوع</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="input w-full text-sm">
                {PROVIDER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {form.type !== "manual" && (
              <>
                <div>
                  <label className="label-sm mb-1 block">API Key / App SID</label>
                  <input value={form.apiKey} onChange={e => setForm(p => ({ ...p, apiKey: e.target.value }))} className="input w-full text-sm font-mono" dir="ltr" />
                </div>
                <div>
                  <label className="label-sm mb-1 block">API Secret (اختياري)</label>
                  <input value={form.apiSecret} onChange={e => setForm(p => ({ ...p, apiSecret: e.target.value }))} className="input w-full text-sm font-mono" dir="ltr" />
                </div>
                <div>
                  <label className="label-sm mb-1 block">Sender ID</label>
                  <input value={form.senderId} onChange={e => setForm(p => ({ ...p, senderId: e.target.value }))} className="input w-full text-sm font-mono" dir="ltr" placeholder="KEYONE" />
                </div>
                {form.type === "custom" && (
                  <div>
                    <label className="label-sm mb-1 block">Endpoint URL</label>
                    <input value={form.endpoint} onChange={e => setForm(p => ({ ...p, endpoint: e.target.value }))} className="input w-full text-sm font-mono" dir="ltr" placeholder="https://..." />
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={create} className="btn-primary text-sm">حفظ</button>
            <button onClick={() => setShowForm(false)} className="btn-ghost text-sm">إلغاء</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-slate-500 py-8">جاري التحميل...</p>
      ) : providers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
          <p className="text-slate-400">لا يوجد مزوّدون بعد. أضف مزوّداً للبدء.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map(p => (
            <div key={p.id} className="flex items-center gap-4 rounded-xl border border-white/[0.07] bg-canvas-raised px-5 py-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-white">{p.name}</span>
                  {p.isDefault && <span className="rounded-full bg-brand-500/20 px-2 py-0.5 text-xs text-brand-300">افتراضي</span>}
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-400">{p.type}</span>
                </div>
                <div className="mt-1">
                  <HealthBadge health={p.health} ok={p.lastTestOk} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!p.isDefault && (
                  <button onClick={() => toggleDefault(p.id)} className="btn-ghost text-xs px-3 py-1.5">افتراضي</button>
                )}
                <button onClick={() => testProvider(p.id)} disabled={testing === p.id} className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1">
                  <RefreshCw className={`h-3.5 w-3.5 ${testing === p.id ? "animate-spin" : ""}`} /> اختبار
                </button>
                <button onClick={() => deleteProvider(p.id)} className="p-2 text-slate-600 hover:text-red-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
