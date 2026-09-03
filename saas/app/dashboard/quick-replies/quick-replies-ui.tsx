"use client";

import { useEffect, useState } from "react";
import { Zap, Plus, Trash2, Save, Loader2, Power, PowerOff, Search } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/patterns/page-header";

type QR = {
  id: string;
  triggers: string[];
  reply: string;
  enabled: boolean;
  hits: number;
};

export default function QuickRepliesUi() {
  const [items, setItems] = useState<QR[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTriggers, setNewTriggers] = useState("");
  const [newReply, setNewReply] = useState("");
  const [q, setQ] = useState("");
  const confirm = useConfirm();
  const { error: toastError } = useToast();

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/quick-replies", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "load_failed");
      setItems(j.items || []);
    } catch {
      toastError("تعذّر تحميل الردود السريعة");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function add() {
    const triggers = newTriggers.split(",").map((s) => s.trim()).filter(Boolean);
    if (!triggers.length || !newReply.trim()) return;
    setAdding(true);
    try {
      const r = await fetch("/api/quick-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggers, reply: newReply.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toastError(j?.error || "تعذّر إضافة الرد السريع"); return; }
      setNewTriggers(""); setNewReply("");
      await load();
    } catch {
      toastError("خطأ في الشبكة — تعذّر إضافة الرد السريع");
    } finally {
      setAdding(false);
    }
  }

  async function update(id: string, patch: Partial<QR>) {
    try {
      const r = await fetch(`/api/quick-replies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) { toastError("تعذّر حفظ التعديل"); return; }
      await load();
    } catch {
      toastError("خطأ في الشبكة — تعذّر حفظ التعديل");
    }
  }

  async function remove(id: string) {
    if (!(await confirm({ title: "حذف الرد السريع", body: "هل تريد حذف هذا الرد السريع؟", confirmLabel: "حذف", cancelLabel: "إلغاء", danger: true }))) return;
    try {
      const r = await fetch(`/api/quick-replies/${id}`, { method: "DELETE" });
      if (!r.ok) { toastError("تعذّر حذف الرد السريع"); return; }
      await load();
    } catch {
      toastError("خطأ في الشبكة — تعذّر حذف الرد السريع");
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-white/[0.05] pb-5">
        <PageHeader
          title="الردود السريعة"
          description="الكلمات المفتاحية تُشغّل ردوداً جاهزة — أسرع للعميل وأوفر لك."
        />
      </div>

      {/* Add new */}
      <div className="card p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4" /> إضافة قالب جديد
        </h3>
        <div className="space-y-3">
          <div>
            <label htmlFor="qr-add-triggers" className="label">
              الكلمات المفتاحية (افصل بفاصلة) — مثال: مواعيد,اوقات,بنفتح
            </label>
            <input
              id="qr-add-triggers"
              value={newTriggers}
              onChange={(e) => setNewTriggers(e.target.value)}
              placeholder="مواعيد,اوقات,ساعات العمل"
              className="input w-full"
            />
          </div>
          <div>
            <label htmlFor="qr-add-reply" className="label">الرد</label>
            <textarea
              id="qr-add-reply"
              value={newReply}
              onChange={(e) => setNewReply(e.target.value)}
              rows={3}
              placeholder="مثلاً: مواعيد العمل من 10ص إلى 11م كل أيام الأسبوع ما عدا الجمعة."
              className="input w-full resize-none"
            />
          </div>
          <button
            onClick={add}
            disabled={adding || !newTriggers.trim() || !newReply.trim()}
            className="btn-primary"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            إضافة
          </button>
        </div>
      </div>

      {/* List */}
      <div className="card overflow-hidden">
        {!loading && items.length > 0 && (
          <div className="border-b border-white/[0.06] p-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                aria-label="بحث في الردود والكلمات المفتاحية"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="بحث في الردود والكلمات المفتاحية..."
                className="input w-full pr-9"
                dir="rtl"
              />
            </div>
          </div>
        )}
        {loading && (
          <div className="divide-y divide-white/[0.04]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4 space-y-2">
                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-16 rounded-md" />
                  <Skeleton className="h-5 w-12 rounded-md" />
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        )}
        {!loading && items.length === 0 && (
          <EmptyState
            icon={<Zap className="h-full w-full" />}
            title="لا توجد ردود سريعة بعد"
            description="ابدأ بإضافة الأسئلة المتكررة من أعلى."
          />
        )}
        {!loading && items.length > 0 && (() => {
          const filtered = q.trim()
            ? items.filter((r) => r.triggers.some((t) => t.includes(q)) || r.reply.includes(q))
            : items;
          if (filtered.length === 0) return (
            <EmptyState icon={<Search className="h-full w-full" />} title="لا نتائج مطابقة" description={`لا يوجد رد يطابق "${q}".`} size="sm" />
          );
          return filtered.map((r) => (
            <QuickReplyRow key={r.id} q={r} onUpdate={update} onDelete={remove} />
          ));
        })()}
      </div>
    </div>
  );
}

function QuickReplyRow({
  q, onUpdate, onDelete,
}: {
  q: QR;
  onUpdate: (id: string, patch: Partial<QR>) => void;
  onDelete: (id: string) => void;
}) {
  const [edit, setEdit] = useState(false);
  const [triggersStr, setTriggersStr] = useState(q.triggers.join(", "));
  const [reply, setReply] = useState(q.reply);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const triggers = triggersStr.split(",").map((s) => s.trim()).filter(Boolean);
      await onUpdate(q.id, { triggers, reply });
      setEdit(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`border-b border-white/5 p-4 ${!q.enabled ? "opacity-60" : ""}`}>
      {edit ? (
        <div className="space-y-2">
          <input
            value={triggersStr}
            onChange={(e) => setTriggersStr(e.target.value)}
            aria-label="الكلمات المفتاحية"
            className="input w-full"
          />
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            aria-label="نص الرد"
            className="input w-full resize-none"
          />
          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs inline-flex items-center gap-1">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              حفظ
            </button>
            <button onClick={() => setEdit(false)}
                    className="btn-ghost px-3 py-1.5 text-xs">
              إلغاء
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {q.triggers.map((t, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-yellow-500/10 text-yellow-300 border border-yellow-500/30">
                  {t}
                </span>
              ))}
            </div>
            <div className="text-sm text-slate-200 whitespace-pre-wrap">{q.reply}</div>
            <div className="text-[10px] text-slate-500 mt-2">استُخدم {q.hits} مرة</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => onUpdate(q.id, { enabled: !q.enabled })}
              aria-label={q.enabled ? "تعطيل الرد السريع" : "تفعيل الرد السريع"}
              className={`p-1.5 rounded-md ${q.enabled ? "text-emerald-300 hover:bg-emerald-500/10" : "text-slate-500 hover:bg-white/5"}`}
            >
              {q.enabled ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setEdit(true)}
              className="btn-ghost px-2.5 py-1 text-xs"
            >
              تعديل
            </button>
            <button
              onClick={() => onDelete(q.id)}
              aria-label="حذف الرد السريع"
              className="p-1.5 rounded-md text-rose-300 hover:bg-rose-500/10"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
