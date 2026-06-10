"use client";

import { useEffect, useState } from "react";
import {
  Zap, Plus, Trash2, ToggleLeft, ToggleRight,
  Loader2, X, ChevronDown, AlertTriangle,
} from "lucide-react";
import {
  AUTOMATION_TRIGGERS,
  AUTOMATION_ACTIONS,
  SCORE_METRICS,
} from "@/lib/automations/constants";

// ── Meta ────────────────────────────────────────────────────────────────────

const TRIGGER_META: Record<string, { label: string; desc: string }> = {
  score_crossed:         { label: "تخطّى النقاط",      desc: "عندما تتخطى نقطة عميل حدّاً معيناً" },
  stage_changed:         { label: "تغيّرت المرحلة",    desc: "عند الانتقال بين مراحل المحادثة" },
  idle_hours:            { label: "لم يرد منذ وقت",    desc: "عندما يصمت العميل فترة محددة" },
  order_status_changed:  { label: "تغيّر الطلب",       desc: "عند تغيير حالة طلب عبر التجارة" },
  cart_abandoned:        { label: "كارت مهجور",        desc: "اهتمّ بمنتج ثم اختفى" },
  order_value_gt:        { label: "قيمة الطلب تتعدّى",  desc: "عند إنشاء طلب بقيمة تتجاوز حدّاً معيناً" },
};

const ACTION_META: Record<string, { label: string; desc: string }> = {
  queue_follow_up:          { label: "رسالة متابعة",        desc: "يضيف رسالة في قائمة المتابعة الذكية" },
  tag_customer:             { label: "إضافة تاجة",           desc: "يضيف تاجة على العميل" },
  notify_admin:             { label: "تنبيه الإدارة",        desc: "يُرسل تنبيه لرقم الإدارة" },
  add_to_segment_broadcast: { label: "إضافة لشريحة",         desc: "يضيف العميل لشريحة بث" },
  send_email:               { label: "إرسال بريد",           desc: "يرسل بريداً عبر مزوّدك (مع تبديل احتياطي)" },
  send_sms:                 { label: "إرسال SMS",            desc: "يرسل رسالة SMS عبر مزوّدك (مع تبديل احتياطي)" },
};

const METRIC_META: Record<string, string> = {
  leadScore:        "نقاط الاهتمام",
  conversionScore:  "احتمال الشراء",
  hesitationScore:  "نقاط التردد",
  churnRiskScore:   "خطر الخسارة",
  loyaltyScore:     "الولاء",
  retentionScore:   "الاستمرارية",
  purchaseProb:     "احتمال الشراء (ML)",
  frustrationScore: "نقاط الإحباط",
};

const OPS = [">", ">=", "<", "<=", "=="] as const;

// ── Types ───────────────────────────────────────────────────────────────────

interface Rule {
  id: string;
  name: string;
  triggerType: string;
  actionType: string;
  conditions: Record<string, any>;
  actionConfig: Record<string, any>;
  enabled: boolean;
  throttleSeconds: number;
  fireCount: number;
  lastFiredAt: string | null;
}

const BLANK: Omit<Rule, "id" | "fireCount" | "lastFiredAt"> = {
  name: "قاعدة جديدة",
  triggerType: AUTOMATION_TRIGGERS[0],
  actionType: AUTOMATION_ACTIONS[0],
  conditions: { metric: "churnRiskScore", op: ">=", value: 60 },
  actionConfig: { delayHours: 2, message: "" },
  enabled: false,
  throttleSeconds: 86400,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseConditions(rule: Rule): Record<string, any> {
  if (typeof rule.conditions === "string") {
    try { return JSON.parse(rule.conditions); } catch { return {}; }
  }
  return rule.conditions || {};
}

function parseActionConfig(rule: Rule): Record<string, any> {
  if (typeof rule.actionConfig === "string") {
    try { return JSON.parse(rule.actionConfig); } catch { return {}; }
  }
  return rule.actionConfig || {};
}

// ── Components ───────────────────────────────────────────────────────────────

function ConditionsEditor({
  triggerType,
  conditions,
  onChange,
}: {
  triggerType: string;
  conditions: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
}) {
  switch (triggerType) {
    case "score_crossed":
      return (
        <div className="flex flex-wrap gap-2 items-center">
          <select
            className="input flex-1 min-w-[140px]"
            value={conditions.metric || "churnRiskScore"}
            onChange={(e) => onChange({ ...conditions, metric: e.target.value })}
          >
            {SCORE_METRICS.map((m) => (
              <option key={m} value={m}>{METRIC_META[m] || m}</option>
            ))}
          </select>
          <select
            className="input w-20"
            value={conditions.op || ">="}
            onChange={(e) => onChange({ ...conditions, op: e.target.value })}
          >
            {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <input
            type="number" min={0} max={100}
            className="input w-20"
            value={conditions.value ?? 60}
            onChange={(e) => onChange({ ...conditions, value: Number(e.target.value) })}
          />
          <span className="text-xs text-slate-400">من 100</span>
        </div>
      );
    case "idle_hours":
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">لم يرد منذ</span>
          <input
            type="number" min={1} max={720}
            className="input w-24"
            value={conditions.hours ?? 24}
            onChange={(e) => onChange({ ...conditions, hours: Number(e.target.value) })}
          />
          <span className="text-sm text-slate-400">ساعة</span>
        </div>
      );
    case "order_status_changed":
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">الحالة</span>
          <select
            className="input flex-1"
            value={conditions.status || ""}
            onChange={(e) => onChange({ ...conditions, status: e.target.value || undefined })}
          >
            <option value="">أي تغيير</option>
            {["confirmed", "preparing", "shipped", "out_for_delivery", "delivered", "canceled"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      );
    case "stage_changed":
      return (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-slate-400">من</span>
          <input
            className="input flex-1 min-w-[100px]"
            value={conditions.fromStage || ""}
            placeholder="أي مرحلة"
            onChange={(e) => onChange({ ...conditions, fromStage: e.target.value || undefined })}
          />
          <span className="text-xs text-slate-400">إلى</span>
          <input
            className="input flex-1 min-w-[100px]"
            value={conditions.toStage || ""}
            placeholder="أي مرحلة"
            onChange={(e) => onChange({ ...conditions, toStage: e.target.value || undefined })}
          />
        </div>
      );
    case "cart_abandoned":
      return <p className="text-xs text-slate-400">يتحقق عند تشغيل دورة الكارت المهجور.</p>;
    case "order_value_gt":
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">قيمة الطلب</span>
          <select
            className="input w-20"
            value={conditions.op || ">"}
            onChange={(e) => onChange({ ...conditions, op: e.target.value })}
          >
            {OPS.map((o) => (<option key={o} value={o}>{o}</option>))}
          </select>
          <input
            type="number" min={0}
            className="input w-32"
            value={conditions.value ?? 0}
            onChange={(e) => onChange({ ...conditions, value: Number(e.target.value) })}
          />
        </div>
      );
    default:
      return null;
  }
}

function ActionConfigEditor({
  actionType,
  config,
  onChange,
}: {
  actionType: string;
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
}) {
  switch (actionType) {
    case "queue_follow_up":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400 shrink-0">تأخير</span>
            <input
              type="number" min={1} max={168}
              className="input w-20"
              value={config.delayHours ?? 2}
              onChange={(e) => onChange({ ...config, delayHours: Number(e.target.value) })}
            />
            <span className="text-sm text-slate-400">ساعة</span>
          </div>
          <textarea
            className="input text-sm resize-none min-h-[60px]"
            placeholder="نص الرسالة (اختياري — إذا فارغ يُولّد تلقائياً)"
            value={config.message || ""}
            onChange={(e) => onChange({ ...config, message: e.target.value })}
          />
        </div>
      );
    case "tag_customer":
      return (
        <input
          className="input"
          placeholder="اسم التاجة، مثال: win-back"
          value={config.tag || ""}
          onChange={(e) => onChange({ ...config, tag: e.target.value })}
        />
      );
    case "notify_admin":
      return (
        <div className="space-y-2">
          <input
            className="input"
            placeholder="رقم التنبيه (يساوي رقم الإدارة الافتراضي)"
            value={config.toPhone || ""}
            onChange={(e) => onChange({ ...config, toPhone: e.target.value })}
          />
          <input
            className="input"
            placeholder="نص التنبيه (اختياري)"
            value={config.message || ""}
            onChange={(e) => onChange({ ...config, message: e.target.value })}
          />
        </div>
      );
    case "add_to_segment_broadcast":
      return (
        <input
          className="input"
          placeholder="اسم الشريحة، مثال: win-back-2026"
          value={config.segment || ""}
          onChange={(e) => onChange({ ...config, segment: e.target.value })}
        />
      );
    case "send_email":
      return (
        <div className="space-y-2">
          <input
            className="input"
            placeholder="البريد المستلِم (مثال: orders@yourbrand.com)"
            value={config.to || ""}
            onChange={(e) => onChange({ ...config, to: e.target.value })}
          />
          <input
            className="input"
            placeholder="عنوان الرسالة"
            value={config.subject || ""}
            onChange={(e) => onChange({ ...config, subject: e.target.value })}
          />
          <textarea
            className="input text-sm resize-none min-h-[60px]"
            placeholder="نص الرسالة (HTML مدعوم)"
            value={config.body || ""}
            onChange={(e) => onChange({ ...config, body: e.target.value })}
          />
          <p className="text-[11px] text-slate-500">يُرسل عبر مزوّدي البريد في الإعدادات ← المزوّدون ← البريد. لو مفيش مزوّد، تُتخطّى القاعدة بدون خطأ.</p>
        </div>
      );
    case "send_sms":
      return (
        <div className="space-y-2">
          <input
            className="input"
            placeholder="رقم المستلِم E.164 (اتركه فارغاً لإرساله للعميل)"
            value={config.to || ""}
            onChange={(e) => onChange({ ...config, to: e.target.value })}
          />
          <textarea
            className="input text-sm resize-none min-h-[60px]"
            placeholder="نص الرسالة"
            value={config.message || ""}
            onChange={(e) => onChange({ ...config, message: e.target.value })}
          />
          <p className="text-[11px] text-slate-500">يُرسل عبر مزوّدي SMS في الإعدادات ← المزوّدون ← SMS. لو مفيش مزوّد، تُتخطّى القاعدة بدون خطأ.</p>
        </div>
      );
    default:
      return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function RuleBuilderUi() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<typeof BLANK | null>(null);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/automations/rules", { cache: "no-store" });
      const j = await r.json();
      setRules(j.items || []);
    } finally { setLoading(false); }
  }

  async function toggle(rule: Rule) {
    await fetch("/api/automations/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
    });
    setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
  }

  async function deleteRule(id: string) {
    if (!confirm("حذف القاعدة؟")) return;
    await fetch(`/api/automations/rules?id=${id}`, { method: "DELETE" });
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  async function createRule() {
    if (!draft) return;
    setSaving(true);
    const r = await fetch("/api/automations/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setSaving(false);
    if (r.ok) {
      setDraft(null);
      await load();
      setMsg({ ok: true, text: "تم إنشاء القاعدة — فعّلها عند الجاهزية" });
    } else {
      setMsg({ ok: false, text: "فشل الإنشاء" });
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    const r = await fetch("/api/automations/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing.id,
        name: editing.name,
        conditions: typeof editing.conditions === "string"
          ? JSON.parse(editing.conditions)
          : editing.conditions,
        actionConfig: typeof editing.actionConfig === "string"
          ? JSON.parse(editing.actionConfig)
          : editing.actionConfig,
        throttleSeconds: editing.throttleSeconds,
      }),
    });
    setSaving(false);
    if (r.ok) {
      setEditing(null);
      await load();
      setMsg({ ok: true, text: "تم الحفظ" });
    } else {
      setMsg({ ok: false, text: "فشل الحفظ" });
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="page-title mb-1 flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-amber-400" />
            قواعد الأتمتة الذكية
          </h2>
          <p className="page-desc text-xs">
            if-this-then-that بدون كود — تُشغَّل في الخلفية فقط، كل إجراء يمر عبر قناة إرسال آمنة.
          </p>
        </div>
        <button onClick={() => setDraft({ ...BLANK })} className="btn-primary shrink-0 text-sm">
          <Plus className="h-4 w-4" /> قاعدة جديدة
        </button>
      </div>

      {msg && (
        <div className={`rounded-xl p-3 text-sm ${msg.ok ? "bg-brand-500/10 text-brand-300 border border-brand-500/20" : "bg-rose-500/10 text-rose-300 border border-rose-500/20"}`}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="float-left text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {!loading && rules.length === 0 && !draft && (
        <div className="card p-10 text-center">
          <Zap className="h-10 w-10 mx-auto mb-3 text-slate-600" />
          <h3 className="font-bold mb-1">لا توجد قواعد بعد</h3>
          <p className="text-sm text-slate-400 mb-4">مثال: إذا خطر الخسارة &gt; 60 → أرسل رسالة استعادة.</p>
          <button onClick={() => setDraft({ ...BLANK })} className="btn-primary">
            <Plus className="h-4 w-4" /> أول قاعدة
          </button>
        </div>
      )}

      {/* Rule list */}
      <div className="space-y-3">
        {rules.map((rule) => {
          const cond = parseConditions(rule);
          const trig = TRIGGER_META[rule.triggerType] || { label: rule.triggerType, desc: "" };
          const act  = ACTION_META[rule.actionType]   || { label: rule.actionType,   desc: "" };
          return (
            <div key={rule.id} className="card p-4 flex flex-wrap items-center gap-3 justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold text-sm">{rule.name}</span>
                  <span className={`text-[11px] rounded-full px-2 py-0.5 border ${rule.enabled ? "border-brand-500/30 bg-brand-500/10 text-brand-300" : "border-slate-600 bg-slate-800 text-slate-500"}`}>
                    {rule.enabled ? "مفعّل" : "معطّل"}
                  </span>
                </div>
                <div className="text-xs text-slate-400 flex flex-wrap gap-1">
                  <span className="bg-white/[0.05] rounded px-1.5 py-0.5">{trig.label}</span>
                  <span className="text-slate-600">→</span>
                  <span className="bg-white/[0.05] rounded px-1.5 py-0.5">{act.label}</span>
                  {rule.fireCount > 0 && (
                    <span className="text-slate-500 mr-2">أُطلقت {rule.fireCount} مرة</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => toggle(rule)} title={rule.enabled ? "إيقاف" : "تفعيل"} className="text-slate-400 hover:text-white">
                  {rule.enabled ? <ToggleRight className="h-5 w-5 text-brand-400" /> : <ToggleLeft className="h-5 w-5" />}
                </button>
                <button onClick={() => setEditing({ ...rule, conditions: parseConditions(rule), actionConfig: parseActionConfig(rule) })} className="btn-ghost px-3 py-1.5 text-xs">
                  تعديل
                </button>
                <button onClick={() => deleteRule(rule.id)} className="text-rose-400/60 hover:text-rose-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create modal */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur overflow-y-auto">
          <div className="card w-full max-w-lg p-6 space-y-4 my-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">قاعدة جديدة</h2>
              <button onClick={() => setDraft(null)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <div>
              <label className="label">اسم القاعدة</label>
              <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">المُشغِّل</label>
                <div className="relative">
                  <select className="input appearance-none w-full" value={draft.triggerType}
                    onChange={(e) => setDraft({ ...draft, triggerType: e.target.value, conditions: {} })}>
                    {AUTOMATION_TRIGGERS.map((t) => (
                      <option key={t} value={t}>{TRIGGER_META[t]?.label || t}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                </div>
              </div>
              <div>
                <label className="label">الإجراء</label>
                <div className="relative">
                  <select className="input appearance-none w-full" value={draft.actionType}
                    onChange={(e) => setDraft({ ...draft, actionType: e.target.value, actionConfig: {} })}>
                    {AUTOMATION_ACTIONS.map((a) => (
                      <option key={a} value={a}>{ACTION_META[a]?.label || a}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                </div>
              </div>
            </div>

            <div>
              <label className="label">الشرط</label>
              <ConditionsEditor triggerType={draft.triggerType} conditions={draft.conditions}
                onChange={(c) => setDraft({ ...draft, conditions: c })} />
            </div>

            <div>
              <label className="label">إعداد الإجراء</label>
              <ActionConfigEditor actionType={draft.actionType} config={draft.actionConfig}
                onChange={(c) => setDraft({ ...draft, actionConfig: c })} />
            </div>

            <div className="flex items-center gap-2">
              <label className="label mb-0">تأخير التكرار (ساعة)</label>
              <input type="number" min={0} max={720} className="input w-24"
                value={Math.round(draft.throttleSeconds / 3600)}
                onChange={(e) => setDraft({ ...draft, throttleSeconds: Number(e.target.value) * 3600 })} />
              <span className="text-xs text-slate-500">لنفس العميل</span>
            </div>

            <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 p-3 text-xs text-amber-300 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              القاعدة معطّلة افتراضياً — فعّلها يدوياً بعد المراجعة.
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setDraft(null)} className="btn-ghost">إلغاء</button>
              <button onClick={createRule} disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                إنشاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur overflow-y-auto">
          <div className="card w-full max-w-lg p-6 space-y-4 my-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">تعديل القاعدة</h2>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <div>
              <label className="label">الاسم</label>
              <input className="input" value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>

            <div className="flex gap-2">
              <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs">{TRIGGER_META[editing.triggerType]?.label || editing.triggerType}</span>
              <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs">{ACTION_META[editing.actionType]?.label || editing.actionType}</span>
            </div>

            <div>
              <label className="label">الشرط</label>
              <ConditionsEditor triggerType={editing.triggerType}
                conditions={editing.conditions}
                onChange={(c) => setEditing({ ...editing, conditions: c })} />
            </div>

            <div>
              <label className="label">إعداد الإجراء</label>
              <ActionConfigEditor actionType={editing.actionType}
                config={editing.actionConfig}
                onChange={(c) => setEditing({ ...editing, actionConfig: c })} />
            </div>

            <div className="flex items-center gap-2">
              <label className="label mb-0">تأخير التكرار (ساعة)</label>
              <input type="number" min={0} max={720} className="input w-24"
                value={Math.round(editing.throttleSeconds / 3600)}
                onChange={(e) => setEditing({ ...editing, throttleSeconds: Number(e.target.value) * 3600 })} />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="btn-ghost">إلغاء</button>
              <button onClick={saveEdit} disabled={saving} className="btn-primary">
                {saving ? "..." : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
