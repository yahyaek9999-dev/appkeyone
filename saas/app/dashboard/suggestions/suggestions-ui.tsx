"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Lightbulb,
  Plus,
  Trash2,
  X,
  Save,
  Loader2,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { timeAgo } from "@/lib/format";

type Gap = {
  id: string;
  question: string;
  occurrences: number;
  score?: number;
  impactLabel?: string;
  reasons?: string[];
  productHint?: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function SuggestionsUi() {
  const [items, setItems] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(true);
  const [answering, setAnswering] = useState<Gap | null>(null);
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/knowledge-gaps", { cache: "no-store" });
      if (!r.ok) {
        setError(
          `فشل تحميل الاقتراحات (${r.status}). تحقق من الاتصال وأعد المحاولة.`,
        );
        setItems([]);
        return;
      }
      const j = await r.json();
      if (j.error) {
        setError(j.error);
        setItems([]);
        return;
      }
      setItems(j.items || []);
    } catch (e: any) {
      setError("تعذّر الاتصال بالخادم. تحقق من الإنترنت وأعد المحاولة.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addAnswer() {
    if (!answering || !answer.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/knowledge-gaps/${answering.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add-knowledge",
          answer: answer.trim(),
        }),
      });
      setAnswering(null);
      setAnswer("");
      load();
    } finally {
      setSaving(false);
    }
  }

  async function dismiss(g: Gap) {
    await fetch(`/api/knowledge-gaps/${g.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    });
    load();
  }

  async function remove(g: Gap) {
    if (!(await confirm({ title: "حذف الاقتراح", body: "هل تريد حذف هذا الاقتراح؟", confirmLabel: "حذف", cancelLabel: "إلغاء", danger: true }))) return;
    await fetch(`/api/knowledge-gaps/${g.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lightbulb className="w-6 h-6 text-yellow-400" />
            اقتراحات تطوير قاعدة المعرفة
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            الأسئلة التي طرحها العملاء ولم يتمكن البوت من الإجابة عليها. أضف
            الإجابة لتعليم البوت.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-300 hover:bg-white/10 disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <span>↻</span>
          )}
          تحديث
        </button>
      </div>

      <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-2xl p-4 flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
        <div className="text-sm">
          <strong className="text-yellow-200">كيف يعمل؟</strong>
          <p className="text-slate-300 mt-1">
            في كل مرة يقول فيها البوت "لا أعرف" أو يحوّل العميل للإدارة، يحفظ
            النظام السؤال هنا. عند إضافتك للإجابة، يتم تخزينها تلقائياً في قاعدة
            المعرفة، ولن يخطئ البوت في هذا السؤال مرة أخرى.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-rose-200">{error}</div>
          <button
            onClick={load}
            className="text-xs text-rose-300 hover:text-rose-200 underline shrink-0"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        {loading && (
          <div className="p-8 text-center text-slate-400 text-sm">
            جاري التحميل...
          </div>
        )}
        {!loading && items.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-sm">
            <Lightbulb className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <div>لا توجد اقتراحات حالياً.</div>
            <div className="text-xs mt-1">
              البوت يجيب على كل أسئلة عملائك من قاعدة المعرفة. عمل ممتاز! ✨
            </div>
          </div>
        )}
        {!loading &&
          items.map((g) => (
            <div
              key={g.id}
              className="border-b border-white/5 p-4 flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  {g.impactLabel && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      {g.impactLabel}
                    </span>
                  )}
                  {g.occurrences > 1 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-300 border border-yellow-500/30">
                      تكرّر {g.occurrences} مرات
                    </span>
                  )}
                  {!!g.score && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-slate-300 border border-white/10">
                      أولوية {g.score}
                    </span>
                  )}
                  <span className="text-xs text-slate-500">
                    {timeAgo(g.updatedAt)}
                  </span>
                </div>
                <div className="text-sm text-slate-100">{g.question}</div>
                {!!g.reasons?.length && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {g.reasons.slice(0, 4).map((r) => (
                      <span
                        key={r}
                        className="text-[11px] text-slate-400 bg-white/[0.03] border border-white/5 rounded-full px-2 py-0.5"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => {
                    setAnswering(g);
                    setAnswer("");
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  إضافة إجابة
                </button>
                <button
                  onClick={() => dismiss(g)}
                  title="تجاهل"
                  className="p-1.5 rounded-md text-slate-400 hover:bg-white/5"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={() => remove(g)}
                  title="حذف"
                  className="p-1.5 rounded-md text-rose-300 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
      </div>

      {/* Modal: add answer */}
      {answering && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">إضافة إجابة لقاعدة المعرفة</h3>
              <button
                onClick={() => setAnswering(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-3 mb-4 text-sm">
              <span className="text-xs text-slate-400">السؤال:</span>
              <div className="mt-1">{answering.question}</div>
            </div>
            <label className="text-xs text-slate-400 mb-1 block">
              الإجابة (سيستخدمها البوت لكل عميل يسأل سؤالاً مماثلاً):
            </label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={5}
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-brand-500 resize-none"
              placeholder="اكتب الإجابة الكاملة هنا..."
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setAnswering(null)}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"
              >
                إلغاء
              </button>
              <button
                onClick={addAnswer}
                disabled={saving || !answer.trim()}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm inline-flex items-center gap-2"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                حفظ في قاعدة المعرفة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

