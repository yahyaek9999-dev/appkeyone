"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Trash2, Play, Pause, Settings, ChevronRight, ChevronDown,
  MessageSquare, List, GitBranch, Users, PhoneCall, Timer, Tag,
  FileText, Zap, X, ArrowRight, CheckCircle, AlertCircle, Loader2,
  Workflow, Eye, PenLine, Copy
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useMutate } from "@/components/ui/use-mutate";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import NodeEditor from "./node-editor";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NodeType =
  | "start" | "message" | "buttons" | "question" | "condition"
  | "assign" | "handoff" | "delay" | "tag" | "sms" | "end";

export interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: Record<string, any>;
  nextId?: string;           // default next node
  branches?: Array<{ label: string; value: string; nextId: string }>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface ConvFlow {
  id: string;
  name: string;
  description: string;
  trigger: string;
  status: string;
  version: number;
  execCount: number;
  completions: number;
  handoffs: number;
  isDefault: boolean;
  updatedAt: string;
}

// ─── Node type definitions ────────────────────────────────────────────────────

export const NODE_TYPES: Array<{
  type: NodeType;
  label: string;
  icon: typeof MessageSquare;
  color: string;
  description: string;
}> = [
  { type: "message", label: "رسالة", icon: MessageSquare, color: "bg-blue-500/20 border-blue-500/30 text-blue-300", description: "إرسال رسالة نصية للعميل" },
  { type: "buttons", label: "أزرار اختيار", icon: List, color: "bg-purple-500/20 border-purple-500/30 text-purple-300", description: "رسالة مع خيارات قابلة للضغط" },
  { type: "question", label: "سؤال", icon: FileText, color: "bg-cyan-500/20 border-cyan-500/30 text-cyan-300", description: "اسأل العميل وخزّن الإجابة" },
  { type: "condition", label: "شرط", icon: GitBranch, color: "bg-yellow-500/20 border-yellow-500/30 text-yellow-300", description: "تفريع المسار بناءً على شرط" },
  { type: "assign", label: "تعيين للفريق", icon: Users, color: "bg-emerald-500/20 border-emerald-500/30 text-emerald-300", description: "تعيين المحادثة لموظف أو فريق" },
  { type: "handoff", label: "تحويل للإنسان", icon: PhoneCall, color: "bg-red-500/20 border-red-500/30 text-red-300", description: "تحويل المحادثة لموظف بشري فوراً" },
  { type: "delay", label: "تأخير", icon: Timer, color: "bg-slate-500/20 border-slate-500/30 text-slate-300", description: "انتظر مدة قبل المتابعة" },
  { type: "tag", label: "إضافة تاق", icon: Tag, color: "bg-pink-500/20 border-pink-500/30 text-pink-300", description: "أضف تاق للعميل" },
  { type: "sms", label: "إرسال SMS", icon: Zap, color: "bg-orange-500/20 border-orange-500/30 text-orange-300", description: "إرسال رسالة SMS عبر K1SMS" },
  { type: "end", label: "نهاية", icon: CheckCircle, color: "bg-slate-600/20 border-slate-600/30 text-slate-400", description: "نهاية المسار" },
];

const TRIGGER_LABELS: Record<string, string> = {
  message_in: "عند استلام رسالة",
  keyword: "عند كلمة مفتاحية",
  button_tap: "عند ضغط زر",
  order_event: "عند حدث طلب",
  manual: "تشغيل يدوي",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BotBuilderUi() {
  const mutate = useMutate();
  const { success, error: toastError } = useToast();
  const confirm = useConfirm();

  const [flows, setFlows] = useState<ConvFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFlow, setSelectedFlow] = useState<ConvFlow | null>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [editingNode, setEditingNode] = useState<FlowNode | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTrigger, setNewTrigger] = useState<string>("message_in");
  const [showNewForm, setShowNewForm] = useState(false);

  // Load flow list
  async function loadFlows() {
    setLoading(true);
    try {
      const r = await fetch("/api/conv-flows", { cache: "no-store" });
      const j = await r.json();
      setFlows(j.flows || []);
    } finally {
      setLoading(false);
    }
  }

  // Load full flow (nodes + edges)
  async function loadFlow(id: string) {
    const r = await fetch(`/api/conv-flows/${id}`, { cache: "no-store" });
    const j = await r.json();
    if (j.ok) {
      setNodes(j.flow.nodes || []);
      setEdges(j.flow.edges || []);
      setSelectedFlow(j.flow);
    }
  }

  useEffect(() => { loadFlows(); }, []);

  // Save current flow graph
  async function save() {
    if (!selectedFlow) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/conv-flows/${selectedFlow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges }),
      });
      const j = await r.json();
      if (j.ok) success("تم الحفظ");
      else toastError(j.error || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  // Toggle flow active/paused
  async function toggleStatus(flow: ConvFlow) {
    const newStatus = flow.status === "active" ? "paused" : "active";
    const r = await fetch(`/api/conv-flows/${flow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const j = await r.json();
    if (j.ok) {
      setFlows((prev) => prev.map((f) => f.id === flow.id ? { ...f, status: newStatus } : f));
      if (selectedFlow?.id === flow.id) setSelectedFlow((p) => p ? { ...p, status: newStatus } : p);
      success(`تم ${newStatus === "active" ? "تفعيل" : "إيقاف"} المسار`);
    }
  }

  // Delete (archive) flow
  async function deleteFlow(flow: ConvFlow) {
    const ok = await confirm({ title: "حذف المسار", body: `هل أنت متأكد من حذف "${flow.name}"؟` });
    if (!ok) return;
    if (!(await mutate(`/api/conv-flows/${flow.id}`, { method: "DELETE" }))) return;
    setFlows((prev) => prev.filter((f) => f.id !== flow.id));
    if (selectedFlow?.id === flow.id) { setSelectedFlow(null); setNodes([]); setEdges([]); }
    success("تم الحذف");
  }

  // Create a new flow
  async function createFlow() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/conv-flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), trigger: newTrigger }),
      });
      const j = await r.json();
      if (j.ok) {
        success("تم إنشاء المسار");
        setShowNewForm(false);
        setNewName("");
        await loadFlows();
        await loadFlow(j.flow.id);
      } else {
        toastError(j.error || "فشل الإنشاء");
      }
    } finally {
      setCreating(false);
    }
  }

  // Add a node to the canvas
  function addNode(type: NodeType) {
    const id = `node_${Date.now()}`;
    const y = nodes.length > 0 ? Math.max(...nodes.map((n) => n.position.y)) + 120 : 200;
    const newNode: FlowNode = {
      id,
      type,
      position: { x: 200, y },
      data: getDefaultData(type),
    };
    const updatedNodes = [...nodes, newNode];
    // Auto-link last non-end node to this one
    const lastNode = [...nodes].reverse().find((n) => n.type !== "end" && !n.nextId);
    if (lastNode) {
      const updatedLastNode = { ...lastNode, nextId: id };
      setNodes(updatedNodes.map((n) => n.id === lastNode.id ? updatedLastNode : n));
    } else {
      setNodes(updatedNodes);
    }
    setEditingNode(newNode);
  }

  function getDefaultData(type: NodeType): Record<string, any> {
    switch (type) {
      case "message": return { text: "مرحباً {{اسم_العميل}}،" };
      case "buttons": return { text: "كيف يمكنني مساعدتك؟", buttons: [{ label: "طلب جديد", value: "new_order" }, { label: "متابعة طلب", value: "track_order" }] };
      case "question": return { text: "ما هو اسمك؟", variable: "customer_name" };
      case "condition": return { variable: "customer_intent", operator: "equals", value: "", trueBranch: "يستوفي الشرط", falseBranch: "لا يستوفي" };
      case "assign": return { teamName: "", staffId: "" };
      case "handoff": return { reason: "طلب العميل التحدث مع موظف", notify: true };
      case "delay": return { seconds: 2 };
      case "tag": return { tags: [""] };
      case "sms": return { templateId: "", to: "{{phone}}" };
      case "end": return { message: "" };
      default: return {};
    }
  }

  function updateNode(node: FlowNode) {
    setNodes((prev) => prev.map((n) => n.id === node.id ? node : n));
    setEditingNode(null);
  }

  function removeNode(id: string) {
    setNodes((prev) => prev.filter((n) => n.id !== id).map((n) => ({
      ...n,
      nextId: n.nextId === id ? undefined : n.nextId,
      branches: n.branches?.map((b) => b.nextId === id ? { ...b, nextId: "" } : b),
    })));
    if (editingNode?.id === id) setEditingNode(null);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="h-full flex flex-col gap-0" style={{ minHeight: "80vh" }}>
      {/* Header */}
      <div className="border-b border-white/[0.05] pb-5 mb-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="page-title mb-1">منشئ المحادثات</h1>
            <p className="page-desc">صمّم تدفقات محادثة آلية مع رسائل وأزرار وشروط وتحويل للفريق.</p>
          </div>
          <button
            onClick={() => setShowNewForm(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> مسار جديد
          </button>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Flow list (sidebar) */}
        <div className="w-72 shrink-0 flex flex-col gap-2">
          {/* New flow form */}
          {showNewForm && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white">مسار جديد</h3>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="اسم المسار"
                className="input w-full text-sm"
                autoFocus
              />
              <select
                value={newTrigger}
                onChange={(e) => setNewTrigger(e.target.value)}
                className="input w-full text-sm"
              >
                {Object.entries(TRIGGER_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button onClick={createFlow} disabled={creating || !newName.trim()} className="btn-primary flex-1 text-sm">
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "إنشاء"}
                </button>
                <button onClick={() => setShowNewForm(false)} className="btn-ghost text-sm px-3">إلغاء</button>
              </div>
            </div>
          )}

          {flows.length === 0 ? (
            <div className="text-center py-8">
              <Workflow className="h-8 w-8 mx-auto text-slate-600 mb-2" />
              <p className="text-slate-500 text-sm">لا توجد مسارات بعد</p>
              <button onClick={() => setShowNewForm(true)} className="btn-secondary text-xs mt-2">ابدأ بإنشاء مسار</button>
            </div>
          ) : (
            flows.map((flow) => (
              <div
                key={flow.id}
                onClick={() => loadFlow(flow.id)}
                className={`rounded-xl border p-3 cursor-pointer transition-colors ${
                  selectedFlow?.id === flow.id
                    ? "border-brand-500/40 bg-brand-500/10"
                    : "border-white/[0.07] bg-white/[0.02] hover:bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-medium text-white truncate">{flow.name}</span>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleStatus(flow); }}
                      className={`p-1 rounded transition-colors ${flow.status === "active" ? "text-emerald-400 hover:text-emerald-300" : "text-slate-500 hover:text-slate-300"}`}
                      title={flow.status === "active" ? "إيقاف مؤقت" : "تفعيل"}
                    >
                      {flow.status === "active" ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteFlow(flow); }}
                      className="p-1 rounded text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <span className="text-[10px] text-slate-400">{TRIGGER_LABELS[flow.trigger] ?? flow.trigger}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    flow.status === "active" ? "bg-emerald-500/15 text-emerald-400"
                    : flow.status === "paused" ? "bg-amber-500/15 text-amber-400"
                    : "bg-slate-500/15 text-slate-400"
                  }`}>{flow.status === "active" ? "مفعّل" : flow.status === "paused" ? "موقوف" : "مسوّدة"}</span>
                  {flow.isDefault && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400">افتراضي</span>}
                </div>
                <div className="mt-1 flex gap-3 text-[10px] text-slate-500">
                  <span>{flow.execCount} تنفيذ</span>
                  <span>{flow.handoffs} تحويل</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {!selectedFlow ? (
            <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-white/10">
              <div className="text-center">
                <Workflow className="h-10 w-10 mx-auto text-slate-700 mb-3" />
                <p className="text-slate-500 text-sm">اختر مساراً من القائمة أو أنشئ مساراً جديداً</p>
              </div>
            </div>
          ) : (
            <>
              {/* Canvas toolbar */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-semibold text-white">{selectedFlow.name}</span>
                <span className="text-slate-500 text-xs">v{selectedFlow.version}</span>
                <div className="flex-1" />
                <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-1.5 text-sm">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  حفظ
                </button>
              </div>

              {/* Node palette */}
              <div className="flex flex-wrap gap-2 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
                <span className="text-xs text-slate-500 self-center ml-1">أضف عقدة:</span>
                {NODE_TYPES.map((nt) => (
                  <button
                    key={nt.type}
                    onClick={() => addNode(nt.type)}
                    title={nt.description}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 ${nt.color}`}
                  >
                    <nt.icon className="h-3 w-3" />
                    {nt.label}
                  </button>
                ))}
              </div>

              {/* Flow visual (vertical list — linear representation) */}
              <div className="flex-1 rounded-xl border border-white/[0.05] bg-black/20 p-4 overflow-y-auto">
                {nodes.length === 0 ? (
                  <div className="flex items-center justify-center h-40">
                    <p className="text-slate-500 text-sm">أضف عقدة للبدء ←</p>
                  </div>
                ) : (
                  <FlowCanvas
                    nodes={nodes}
                    edges={edges}
                    onSelect={setEditingNode}
                    onRemove={removeNode}
                    selectedId={editingNode?.id}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* Node editor drawer */}
        {editingNode && (
          <div className="w-80 shrink-0">
            <NodeEditor
              node={editingNode}
              onSave={updateNode}
              onClose={() => setEditingNode(null)}
              allNodes={nodes}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Flow Canvas (linear node list with connections) ─────────────────────────

function FlowCanvas({
  nodes,
  edges,
  onSelect,
  onRemove,
  selectedId,
}: {
  nodes: FlowNode[];
  edges: FlowEdge[];
  onSelect: (n: FlowNode) => void;
  onRemove: (id: string) => void;
  selectedId?: string;
}) {
  // Build ordered list: start → follow nextId chain
  const buildOrder = (nodes: FlowNode[]): FlowNode[] => {
    const map = new Map(nodes.map((n) => [n.id, n]));
    const visited = new Set<string>();
    const result: FlowNode[] = [];
    let current = nodes.find((n) => n.type === "start") ?? nodes[0];
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      result.push(current);
      current = current.nextId ? map.get(current.nextId)! : null!;
    }
    // Add any unlinked nodes
    nodes.forEach((n) => { if (!visited.has(n.id)) result.push(n); });
    return result;
  };

  const ordered = buildOrder(nodes);

  return (
    <div className="space-y-2">
      {ordered.map((node, i) => {
        const nt = NODE_TYPES.find((t) => t.type === node.type);
        const Icon = nt?.icon ?? MessageSquare;
        const isSelected = node.id === selectedId;

        return (
          <div key={node.id}>
            <div
              onClick={() => onSelect(node)}
              className={`relative rounded-xl border cursor-pointer transition-colors p-3 ${
                isSelected ? "border-brand-500/50 bg-brand-500/10" : `${nt?.color ?? "border-white/10 bg-white/5"} hover:opacity-90`
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-xs font-medium truncate">{nt?.label ?? node.type}</span>
                  <span className="text-[10px] font-mono text-current/50 truncate max-w-[200px]">
                    {getNodePreview(node)}
                  </span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(node.id); }}
                  className="p-1 rounded opacity-40 hover:opacity-100 hover:text-red-400 transition"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              {/* Branch preview for buttons/condition */}
              {(node.type === "buttons" || node.type === "condition") && node.data.buttons && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(node.data.buttons as any[]).map((b: any, bi: number) => (
                    <span key={bi} className="text-[10px] rounded-full bg-white/10 px-2 py-0.5">{b.label}</span>
                  ))}
                </div>
              )}
            </div>
            {/* Connector arrow (not for last node) */}
            {i < ordered.length - 1 && (
              <div className="flex justify-center py-1">
                <ArrowRight className="h-3.5 w-3.5 text-slate-600 rotate-90" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function getNodePreview(node: FlowNode): string {
  switch (node.type) {
    case "start": return "نقطة الانطلاق";
    case "message": return String(node.data.text || "").slice(0, 50);
    case "buttons": return String(node.data.text || "").slice(0, 40);
    case "question": return String(node.data.text || "").slice(0, 40);
    case "condition": return `إذا {{${node.data.variable}}} ${node.data.operator} "${node.data.value}"`;
    case "assign": return `تعيين لـ ${node.data.teamName || node.data.staffId || "..."}`;
    case "handoff": return node.data.reason?.slice(0, 40) || "تحويل للإنسان";
    case "delay": return `انتظار ${node.data.seconds || 0} ثانية`;
    case "tag": return `تاق: ${(node.data.tags || []).join(", ")}`;
    case "sms": return `SMS → ${node.data.to || "{{phone}}"}`;
    case "end": return node.data.message?.slice(0, 40) || "نهاية المسار";
    default: return "";
  }
}
