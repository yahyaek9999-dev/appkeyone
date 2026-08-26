"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Rocket, Plus, Eye, EyeOff, Archive, Play, Trash2, Edit2, Check, X,
  Package, RefreshCw, ArrowRight,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface FeatureCounts { total: number; enabled: number }
interface Release {
  id: string;
  releaseId: string;
  name: string;
  description: string;
  status: "active" | "beta" | "hidden" | "archived";
  sortOrder: number;
  createdAt: string;
  features: FeatureCounts;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active:   { label: "نشط",    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  beta:     { label: "تجريبي", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  hidden:   { label: "مسودة",  color: "text-slate-400 bg-white/5 border-white/10" },
  archived: { label: "أرشيف",  color: "text-red-400 bg-red-500/10 border-red-500/20" },
};

const TRANSITIONS: Record<string, { label: string; next: string; icon: React.ComponentType<{ className?: string }> }> = {
  hidden:   { label: "نشر تجريبي",   next: "beta",   icon: Eye },
  beta:     { label: "إطلاق رسمي",   next: "active", icon: Play },
  active:   { label: "إخفاء",        next: "hidden", icon: EyeOff },
  archived: { label: "استعادة",      next: "hidden", icon: Eye },
};

export default function ReleasesPage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { success: toastSuccess, error: toastError } = useToast();

  const [newId, setNewId]       = useState("");
  const [newName, setNewName]   = useState("");
  const [newDesc, setNewDesc]   = useState("");
  const [newOrder, setNewOrder] = useState("99");

  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/releases").catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setReleases(data.releases || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!newId.trim() || !newName.trim()) { toastError("المعرّف والاسم مطلوبان"); return; }
    const res = await fetch("/api/admin/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        releaseId: newId.trim().toLowerCase().replace(/\s+/g, "_"),
        name: newName, description: newDesc, status: "hidden", sortOrder: Number(newOrder) || 99,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      toastSuccess("تم إنشاء الإصدار");
      setShowCreate(false);
      setNewId(""); setNewName(""); setNewDesc(""); setNewOrder("99");
      load();
    } else { toastError(data.error || "فشل الإنشاء"); }
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch(`/api/admin/releases/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (data.ok) {
      setReleases((prev) => prev.map((r) => r.id === id ? { ...r, status: status as Release["status"] } : r));
      toastSuccess("تم تحديث الحالة");
    } else { toastError(data.error || "فشل التحديث"); }
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/admin/releases/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, description: editDesc }),
    });
    const data = await res.json();
    if (data.ok) {
      setReleases((prev) => prev.map((r) => r.id === id ? { ...r, name: editName, description: editDesc } : r));
      setEditingId(null);
      toastSuccess("تم الحفظ");
    } else { toastError("فشل الحفظ"); }
  }

  async function deleteRelease(id: string) {
    const res = await fetch(`/api/admin/releases/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      setReleases((prev) => prev.filter((r) => r.id !== id));
      toastSuccess("تم الحذف");
    } else {
      toastError(data.error === "release_has_features"
        ? `لا يمكن الحذف — ${data.featureCount} ميزة مرتبطة`
        : data.error || "فشل الحذف");
    }
  }

  const activeCount = releases.filter((r) => r.status === "active").length;
  const totalFeatures = releases.reduce((s, r) => s + r.features.total, 0);
  const enabledFeatures = releases.reduce((s, r) => s + r.features.enabled, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.06] pb-5">
        <div>
          <h1 className="page-title mb-1">الإصدارات</h1>
          <p className="page-desc">تحكّم في إطلاق الميزات عبر مراحل: مسودة → تجريبي → نشط</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="btn-ghost flex items-center gap-1.5 text-sm">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </button>
          <button onClick={() => setShowCreate((v) => !v)} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus className="h-3.5 w-3.5" />
            إصدار جديد
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatChip label="إجمالي الإصدارات" value={releases.length} />
        <StatChip label="نشطة" value={activeCount} color="text-emerald-400" />
        <StatChip label="ميزات مُتحكّم فيها" value={`${enabledFeatures}/${totalFeatures}`} color="text-brand-400" />
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-white/[0.10] bg-white/[0.03] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-brand-400" />
            <span className="font-semibold text-white">إصدار جديد</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">معرّف الإصدار * (يُستخدم في الكود)</label>
              <input
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="commerce_v2"
                dir="ltr"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">اسم الإصدار *</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="التجارة الإلكترونية 2.0"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">الوصف</label>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="وصف مختصر"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">الترتيب</label>
              <input
                type="number"
                value={newOrder}
                onChange={(e) => setNewOrder(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500/50"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={create} className="btn-primary text-sm flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" /> إنشاء (مسودة)
            </button>
            <button onClick={() => setShowCreate(false)} className="btn-ghost text-sm">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-white/[0.02] animate-pulse" />)}
        </div>
      ) : releases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Rocket className="h-10 w-10 text-slate-600 mb-4" />
          <h3 className="text-sm font-semibold text-white mb-2">لا توجد إصدارات بعد</h3>
          <p className="text-sm text-slate-500 mb-5">أنشئ أول إصدار لتنظيم إطلاق الميزات</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">إنشاء إصدار</button>
        </div>
      ) : (
        <div className="space-y-2">
          {releases.map((r) => {
            const isEditing = editingId === r.id;
            const statusCfg = STATUS_CONFIG[r.status];
            const transition = TRANSITIONS[r.status];
            const NextIcon = transition?.icon;

            return (
              <div
                key={r.id}
                className={`rounded-xl border transition-colors ${
                  r.status === "active" ? "border-emerald-500/20 bg-emerald-500/[0.03]" :
                  r.status === "archived" ? "border-white/[0.04] bg-white/[0.01] opacity-60" :
                  "border-white/[0.07] bg-white/[0.02]"
                }`}
              >
                <div className="flex items-start gap-3 p-4">
                  {/* Icon */}
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${statusCfg.color}`}>
                    <Package className="h-4 w-4" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-sm font-semibold text-white focus:outline-none focus:border-brand-500/50"
                        />
                        <input
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          placeholder="وصف الإصدار"
                          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-brand-500/50"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(r.id)} className="flex items-center gap-1 rounded-lg bg-brand-500/20 border border-brand-500/30 px-3 py-1 text-xs text-brand-300 hover:bg-brand-500/30 transition-colors">
                            <Check className="h-3 w-3" /> حفظ
                          </button>
                          <button onClick={() => setEditingId(null)} className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-slate-400 hover:text-white transition-colors">
                            <X className="h-3 w-3" /> إلغاء
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-semibold text-white text-sm">{r.name}</span>
                          <span className="font-mono text-[10px] text-slate-600 bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded" dir="ltr">{r.releaseId}</span>
                          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
                        </div>
                        {r.description && (
                          <p className="text-[12px] text-slate-400 mb-1">{r.description}</p>
                        )}
                        <div className="flex items-center gap-3 text-[11px] text-slate-600">
                          <span>{r.features.enabled}/{r.features.total} ميزة مفعّلة</span>
                          <span>ترتيب: {r.sortOrder}</span>
                          {r.status === "active" && (
                            <span className="flex items-center gap-1 text-emerald-500">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              متاح للعملاء
                            </span>
                          )}
                          {r.status === "hidden" && (
                            <span className="text-slate-600">غير متاح للعملاء حتى الإطلاق</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  {!isEditing && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {transition && NextIcon && (
                        <button
                          onClick={() => updateStatus(r.id, transition.next)}
                          className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-slate-400 hover:border-white/[0.14] hover:text-white transition-colors"
                        >
                          <NextIcon className="h-3.5 w-3.5" />
                          {transition.label}
                        </button>
                      )}
                      <button
                        onClick={() => { setEditingId(r.id); setEditName(r.name); setEditDesc(r.description); }}
                        className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-1.5 text-slate-500 hover:text-white transition-colors"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      {r.features.total === 0 && (
                        <button
                          onClick={() => deleteRelease(r.id)}
                          className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-1.5 text-slate-600 hover:border-red-500/30 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lifecycle legend */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">دورة حياة الإصدار</div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {[
            { label: "مسودة", color: "text-slate-400 bg-white/5 border-white/10" },
            { label: "→", color: "text-slate-600" },
            { label: "تجريبي", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
            { label: "→", color: "text-slate-600" },
            { label: "نشط", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
            { label: "→", color: "text-slate-600" },
            { label: "أرشيف", color: "text-red-400 bg-red-500/10 border-red-500/20" },
          ].map((item, i) => (
            item.label === "→"
              ? <span key={i} className="text-slate-600">→</span>
              : <span key={i} className={`rounded-full border px-2.5 py-0.5 ${item.color}`}>{item.label}</span>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-600">
          الميزات المرتبطة بإصدار "مسودة" غير متاحة للعملاء حتى لو كانت حالتها "مفعّلة" في مركز الميزات.
        </p>
      </div>
    </div>
  );
}

function StatChip({ label, value, color = "text-white" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}
