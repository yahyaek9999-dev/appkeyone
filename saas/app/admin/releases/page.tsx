"use client";

import { useState, useEffect, useCallback } from "react";
import { Rocket, Plus, Eye, EyeOff, Archive, Play, Trash2, Edit2, Check, X } from "lucide-react";
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

const STATUS_LABELS: Record<string, string> = {
  active: "نشط",
  beta: "تجريبي",
  hidden: "مخفي",
  archived: "أرشيف",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  beta: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  hidden: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  archived: "bg-red-100 text-red-500 dark:bg-red-900/20 dark:text-red-400",
};

const NEXT_STATUS: Record<string, { label: string; value: string; icon: any }> = {
  hidden: { label: "نشر تجريبي", value: "beta", icon: Eye },
  beta: { label: "إطلاق رسمي", value: "active", icon: Play },
  active: { label: "إخفاء", value: "hidden", icon: EyeOff },
  archived: { label: "استعادة (مخفي)", value: "hidden", icon: Eye },
};

export default function ReleasesPage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { success: toastSuccess, error: toastError } = useToast();

  // Create form
  const [newId, setNewId]       = useState("");
  const [newName, setNewName]   = useState("");
  const [newDesc, setNewDesc]   = useState("");
  const [newOrder, setNewOrder] = useState("99");

  // Inline edit
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
    if (!newId.trim() || !newName.trim()) {
      toastError("المعرّف والاسم مطلوبان");
      return;
    }
    const res = await fetch("/api/admin/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        releaseId: newId.trim().toLowerCase().replace(/\s+/g, "_"),
        name: newName,
        description: newDesc,
        status: "hidden",
        sortOrder: Number(newOrder) || 99,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      toastSuccess("تم إنشاء الإصدار");
      setShowCreate(false);
      setNewId(""); setNewName(""); setNewDesc(""); setNewOrder("99");
      load();
    } else {
      toastError(data.error || "فشل الإنشاء");
    }
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch(`/api/admin/releases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (data.ok) {
      setReleases((prev: Release[]) => prev.map((r: Release) => r.id === id ? { ...r, status: status as Release["status"] } : r));
      toastSuccess("تم تحديث الحالة");
    } else {
      toastError(data.error || "فشل التحديث");
    }
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/admin/releases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, description: editDesc }),
    });
    const data = await res.json();
    if (data.ok) {
      setReleases((prev: Release[]) => prev.map((r: Release) => r.id === id ? { ...r, name: editName, description: editDesc } : r));
      setEditingId(null);
      toastSuccess("تم الحفظ");
    } else {
      toastError("فشل الحفظ");
    }
  }

  async function deleteRelease(id: string) {
    const res = await fetch(`/api/admin/releases/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      setReleases((prev: Release[]) => prev.filter((r: Release) => r.id !== id));
      toastSuccess("تم الحذف");
    } else {
      toastError(data.error === "release_has_features"
        ? `لا يمكن الحذف — هناك ${data.featureCount} ميزة مرتبطة`
        : data.error || "فشل الحذف");
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">إدارة الإصدارات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            تحكّم بإطلاق الميزات عبر مراحل: مخفي → تجريبي → نشط
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> إصدار جديد
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="border border-border rounded-xl p-5 space-y-4 bg-muted/20">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" /> إصدار جديد
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">معرّف الإصدار * (سيُستخدم في الكود)</label>
              <input
                value={newId}
                onChange={e => setNewId(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background font-mono"
                placeholder="commerce_v2"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">اسم الإصدار *</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                placeholder="التجارة الإلكترونية 2.0"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">الوصف</label>
              <input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                placeholder="وصف مختصر للإصدار"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">الترتيب</label>
              <input
                type="number"
                value={newOrder}
                onChange={e => setNewOrder(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                min={0}
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={create} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
              إنشاء (مخفي)
            </button>
            <button onClick={() => setShowCreate(false)} className="border border-border px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Releases list */}
      {loading ? (
        <div className="text-sm text-muted-foreground animate-pulse">جاري التحميل...</div>
      ) : releases.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Rocket className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">لا توجد إصدارات بعد</p>
        </div>
      ) : (
        <div className="space-y-2">
          {releases.map(r => {
            const isEditing = editingId === r.id;
            const next = NEXT_STATUS[r.status];
            const NextIcon = next?.icon;

            return (
              <div
                key={r.id}
                className={`border rounded-xl p-4 ${r.status === "active" ? "border-emerald-500/30 bg-emerald-500/5" : r.status === "archived" ? "border-border/50 opacity-60" : "border-border"}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background font-medium"
                        />
                        <input
                          value={editDesc}
                          onChange={e => setEditDesc(e.target.value)}
                          className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-muted-foreground"
                          placeholder="وصف الإصدار"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(r.id)} className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground rounded text-xs">
                            <Check className="h-3 w-3" /> حفظ
                          </button>
                          <button onClick={() => setEditingId(null)} className="flex items-center gap-1 px-3 py-1 border border-border rounded text-xs text-muted-foreground">
                            <X className="h-3 w-3" /> إلغاء
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground">{r.name}</span>
                          <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{r.releaseId}</code>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[r.status]}`}>{STATUS_LABELS[r.status]}</span>
                        </div>
                        {r.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>
                        )}
                        <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                          <span>{r.features.enabled}/{r.features.total} ميزة مفعّلة</span>
                          <span>ترتيب: {r.sortOrder}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-1 shrink-0">
                      {next && (
                        <button
                          onClick={() => updateStatus(r.id, next.value)}
                          title={next.label}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <NextIcon className="h-3.5 w-3.5" />
                          {next.label}
                        </button>
                      )}
                      <button
                        onClick={() => { setEditingId(r.id); setEditName(r.name); setEditDesc(r.description); }}
                        title="تعديل"
                        className="p-1.5 hover:bg-muted rounded text-muted-foreground"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      {r.features.total === 0 && (
                        <button
                          onClick={() => deleteRelease(r.id)}
                          title="حذف"
                          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
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

      <div className="pt-4 border-t border-border">
        <h3 className="text-sm font-semibold text-foreground mb-2">دورة حياة الإصدار</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">مخفي</span>
          <span>→</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">تجريبي</span>
          <span>→</span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">نشط</span>
          <span>→</span>
          <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/20 text-red-500">أرشيف</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          الميزات المرتبطة بإصدار "مخفي" تُعامَل كمخفية حتى لو كانت حالتها "مفعّلة" في مركز التحكم بالميزات.
        </p>
      </div>
    </div>
  );
}
