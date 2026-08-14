"use client";

import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import type { FlowNode, NodeType } from "./bot-builder-ui";

interface Props {
  node: FlowNode;
  allNodes: FlowNode[];
  onSave: (n: FlowNode) => void;
  onClose: () => void;
}

const NODE_LABELS: Record<NodeType, string> = {
  start: "البداية",
  message: "رسالة",
  buttons: "أزرار اختيار",
  question: "سؤال",
  condition: "شرط",
  assign: "تعيين",
  handoff: "تحويل للإنسان",
  delay: "تأخير",
  tag: "تاق",
  sms: "SMS",
  end: "نهاية",
};

export default function NodeEditor({ node, allNodes, onSave, onClose }: Props) {
  const [data, setData] = useState<Record<string, any>>({ ...node.data });
  const [nextId, setNextId] = useState(node.nextId ?? "");

  const otherNodes = allNodes.filter((n) => n.id !== node.id);

  function save() {
    onSave({ ...node, data, nextId: nextId || undefined });
  }

  function setField(key: string, value: any) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="rounded-xl border border-white/10 bg-canvas-raised flex flex-col gap-0 overflow-hidden h-full max-h-[70vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/[0.05]">
        <h3 className="text-sm font-semibold text-white">{NODE_LABELS[node.type] ?? node.type}</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10 transition-colors">
          <X className="h-4 w-4 text-slate-400" />
        </button>
      </div>

      {/* Fields by node type */}
      <div className="p-4 space-y-4 flex-1">
        {node.type === "start" && (
          <p className="text-slate-400 text-sm">نقطة البداية. يتم تنفيذ المسار عند تفعيل المشغّل.</p>
        )}

        {(node.type === "message" || node.type === "question") && (
          <div>
            <label className="label-sm mb-1 block">نص الرسالة</label>
            <textarea
              value={data.text ?? ""}
              onChange={(e) => setField("text", e.target.value)}
              className="input w-full text-sm min-h-[80px] resize-y"
              placeholder="اكتب الرسالة... يمكنك استخدام {{اسم_العميل}}"
            />
            {node.type === "question" && (
              <div className="mt-3">
                <label className="label-sm mb-1 block">حفظ الإجابة في متغير</label>
                <input
                  value={data.variable ?? ""}
                  onChange={(e) => setField("variable", e.target.value)}
                  className="input w-full text-sm font-mono"
                  placeholder="customer_name"
                  dir="ltr"
                />
              </div>
            )}
          </div>
        )}

        {node.type === "buttons" && (
          <div className="space-y-3">
            <div>
              <label className="label-sm mb-1 block">نص الرسالة</label>
              <textarea
                value={data.text ?? ""}
                onChange={(e) => setField("text", e.target.value)}
                className="input w-full text-sm min-h-[60px]"
                placeholder="كيف يمكنني مساعدتك؟"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label-sm">الأزرار</label>
                <button
                  onClick={() => setField("buttons", [...(data.buttons ?? []), { label: "خيار جديد", value: `option_${Date.now()}` }])}
                  className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> أضف زر
                </button>
              </div>
              <div className="space-y-2">
                {(data.buttons ?? []).map((btn: any, i: number) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      value={btn.label}
                      onChange={(e) => {
                        const b = [...(data.buttons ?? [])];
                        b[i] = { ...b[i], label: e.target.value };
                        setField("buttons", b);
                      }}
                      className="input flex-1 text-sm"
                      placeholder="عنوان الزر"
                    />
                    <button
                      onClick={() => {
                        const b = [...(data.buttons ?? [])];
                        b.splice(i, 1);
                        setField("buttons", b);
                      }}
                      className="p-1 text-slate-600 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {node.type === "condition" && (
          <div className="space-y-3">
            <div>
              <label className="label-sm mb-1 block">المتغير</label>
              <input
                value={data.variable ?? ""}
                onChange={(e) => setField("variable", e.target.value)}
                className="input w-full text-sm font-mono"
                placeholder="customer_intent"
                dir="ltr"
              />
            </div>
            <div>
              <label className="label-sm mb-1 block">العملية</label>
              <select value={data.operator ?? "equals"} onChange={(e) => setField("operator", e.target.value)} className="input w-full text-sm">
                <option value="equals">يساوي</option>
                <option value="contains">يحتوي</option>
                <option value="not_equals">لا يساوي</option>
                <option value="exists">موجود</option>
              </select>
            </div>
            {data.operator !== "exists" && (
              <div>
                <label className="label-sm mb-1 block">القيمة</label>
                <input value={data.value ?? ""} onChange={(e) => setField("value", e.target.value)} className="input w-full text-sm" dir="ltr" />
              </div>
            )}
            <div>
              <label className="label-sm mb-1 block">اسم الفرع الصحيح</label>
              <input value={data.trueBranch ?? "يستوفي"} onChange={(e) => setField("trueBranch", e.target.value)} className="input w-full text-sm" />
            </div>
            <div>
              <label className="label-sm mb-1 block">اسم الفرع الخطأ</label>
              <input value={data.falseBranch ?? "لا يستوفي"} onChange={(e) => setField("falseBranch", e.target.value)} className="input w-full text-sm" />
            </div>
          </div>
        )}

        {node.type === "assign" && (
          <div className="space-y-3">
            <div>
              <label className="label-sm mb-1 block">الفريق</label>
              <input value={data.teamName ?? ""} onChange={(e) => setField("teamName", e.target.value)} className="input w-full text-sm" placeholder="المبيعات" />
            </div>
            <div>
              <label className="label-sm mb-1 block">أسلوب التعيين</label>
              <select value={data.strategy ?? "round_robin"} onChange={(e) => setField("strategy", e.target.value)} className="input w-full text-sm">
                <option value="round_robin">Round Robin</option>
                <option value="least_loaded">الأقل حملاً</option>
                <option value="manual">يدوي</option>
              </select>
            </div>
          </div>
        )}

        {node.type === "handoff" && (
          <div className="space-y-3">
            <div>
              <label className="label-sm mb-1 block">سبب التحويل</label>
              <input value={data.reason ?? ""} onChange={(e) => setField("reason", e.target.value)} className="input w-full text-sm" placeholder="طلب العميل التحدث مع موظف" />
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="notify" checked={data.notify ?? true} onChange={(e) => setField("notify", e.target.checked)} className="w-4 h-4" />
              <label htmlFor="notify" className="text-sm text-slate-300">إشعار الفريق فوراً</label>
            </div>
          </div>
        )}

        {node.type === "delay" && (
          <div>
            <label className="label-sm mb-1 block">مدة الانتظار (ثانية)</label>
            <input
              type="number"
              min={1}
              max={3600}
              value={data.seconds ?? 2}
              onChange={(e) => setField("seconds", parseInt(e.target.value) || 1)}
              className="input w-full text-sm"
              dir="ltr"
            />
          </div>
        )}

        {node.type === "tag" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1">
              <label className="label-sm">التاقات</label>
              <button onClick={() => setField("tags", [...(data.tags ?? []), ""])} className="text-xs text-brand-400 flex items-center gap-1"><Plus className="h-3 w-3" /></button>
            </div>
            {(data.tags ?? []).map((t: string, i: number) => (
              <div key={i} className="flex gap-2">
                <input
                  value={t}
                  onChange={(e) => { const ts = [...(data.tags ?? [])]; ts[i] = e.target.value; setField("tags", ts); }}
                  className="input flex-1 text-sm"
                  placeholder="vip"
                />
                <button onClick={() => { const ts = [...(data.tags ?? [])]; ts.splice(i, 1); setField("tags", ts); }} className="p-1 text-slate-600 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        {node.type === "sms" && (
          <div className="space-y-3">
            <div>
              <label className="label-sm mb-1 block">رقم المستلم</label>
              <input value={data.to ?? "{{phone}}"} onChange={(e) => setField("to", e.target.value)} className="input w-full text-sm font-mono" dir="ltr" />
            </div>
            <div>
              <label className="label-sm mb-1 block">نص الرسالة (أو اترك فارغاً لاستخدام قالب)</label>
              <textarea value={data.body ?? ""} onChange={(e) => setField("body", e.target.value)} className="input w-full text-sm min-h-[60px]" placeholder="نص الرسالة..." />
            </div>
          </div>
        )}

        {node.type === "end" && (
          <div>
            <label className="label-sm mb-1 block">رسالة الختام (اختياري)</label>
            <input value={data.message ?? ""} onChange={(e) => setField("message", e.target.value)} className="input w-full text-sm" placeholder="شكراً لك!" />
          </div>
        )}

        {/* Next node */}
        {node.type !== "end" && node.type !== "condition" && (
          <div>
            <label className="label-sm mb-1 block">العقدة التالية</label>
            <select value={nextId} onChange={(e) => setNextId(e.target.value)} className="input w-full text-sm">
              <option value="">— بدون ربط —</option>
              {otherNodes.map((n) => (
                <option key={n.id} value={n.id}>{NODE_LABELS[n.type] ?? n.type}: {n.data.text?.slice(0, 30) || n.id}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/[0.05] flex gap-2">
        <button onClick={save} className="btn-primary flex-1 text-sm">حفظ العقدة</button>
        <button onClick={onClose} className="btn-ghost text-sm px-4">إلغاء</button>
      </div>
    </div>
  );
}
