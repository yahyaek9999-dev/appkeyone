"use client";

import { useEffect, useState } from "react";
import { Zap, Plus, Loader2, Trash2, Workflow } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";

interface Flow {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: string;
  version: number;
  updatedAt: string;
}

const TRIGGERS: { value: string; label: string }[] = [
  { value: "message_received", label: "عند استلام رسالة" },
  { value: "keyword", label: "عند كلمة مفتاحية" },
  { value: "order_created", label: "عند إنشاء طلب" },
  { value: "manual", label: "تشغيل يدوي" },
];

export default function FlowBuilderUi() {
  const { success, error, info } = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("message_received");
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/flows", { cache: "no-store" });
      const j = await r.json();
      setItems(j.items || []);
      setPending(Boolean(j.pending));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!name.trim()) return;
    setAdding(true);
    try {
      const r = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, trigger }),
      });
      const j = await r.json();
      if (r.ok) {
        setName("");
        success("تم إنشاء المسار");
        load();
      } else if (j.pending || r.status === 503) {
        info("الوحدة جاهزة بالكود — تحتاج تفعيل قاعدة البيانات على الخادم.");
      } else {
        error(j.error || "تعذّر الإنشاء");
      }
    } finally {
      setAdding(false);
    }
  }

  async function toggle(f: Flow) {
    await fetch(`/api/flows/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !f.enabled }),
    });
    load();
  }

  async function remove(f: Flow) {
    if (!(await confirm({ title: "حذف المسار", body: `حذف "${f.name}"؟`, confirmLabel: "حذف", cancelLabel: "إلغاء", danger: true }))) return;
    await fetch(`/api/flows/${f.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6 p-1">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Workflow className="h-6 w-6 text-brand-400" />
          منشئ المسارات
        </h1>
        <p className="page-desc mt-1">صمّم رحلات أتمتة: محفّز ← شروط ← إجراءات. كل مسار يعمل في الخلفية تلقائياً.</p>
      </div>

      {pending && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          الوحدة منشورة بالكود. لتفعيل الحفظ، شغّل ترحيل قاعدة البيانات على الخادم (جدول جديد فقط — لا يمسّ بياناتك).
        </div>
      )}

      <div className="card p-5">
        <h3 className="section-title mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4" /> مسار جديد
        </h3>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم المسار (مثال: ترحيب العملاء الجدد)"
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <select
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          >
            {TRIGGERS.map((t) => (
              <option key={t.value} value={t.value} className="bg-canvas">{t.label}</option>
            ))}
          </select>
          <button onClick={create} disabled={adding || !name.trim()} className="btn-primary inline-flex items-center gap-2">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            إنشاء
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {loading && <div className="card p-8 text-center text-slate-400">جارٍ التحميل...</div>}
        {!loading && items.length === 0 && (
          <EmptyState icon={<Zap className="h-full w-full" />} title="لا توجد مسارات بعد" description="أنشئ أول مسار أتمتة لتبدأ توفير الوقت." />
        )}
        {items.map((f) => (
          <div key={f.id} className="card flex items-center justify-between p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">{f.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${f.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-500"}`}>
                  {f.enabled ? "مُفعّل" : "متوقّف"}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {TRIGGERS.find((t) => t.value === f.trigger)?.label || f.trigger} · إصدار {f.version}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggle(f)} className="btn-ghost text-xs">
                {f.enabled ? "إيقاف" : "تفعيل"}
              </button>
              <button onClick={() => remove(f)} className="btn-danger inline-flex items-center gap-1 text-xs">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
