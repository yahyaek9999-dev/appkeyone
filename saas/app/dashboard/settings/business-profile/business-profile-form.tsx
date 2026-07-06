"use client";

import { useMemo, useState } from "react";
import {
  ALL_MODULES,
  MODULE_LABELS,
  VERTICALS,
  resolveVertical,
  moduleMap,
  parseEnabledModules,
  type Vertical,
  type ModuleKey,
} from "@/lib/modules";

interface Initial {
  businessType: string | null;
  enabledModules: string | null;
}

export function BusinessProfileForm({ initial }: { initial: Initial }) {
  const [vertical, setVertical] = useState<Vertical>(resolveVertical(initial.businessType));
  // Explicit per-module overrides the owner has set (moduleKey -> bool). Seeded
  // from the stored enabledModules so we hydrate exactly what was saved.
  const [overrides, setOverrides] = useState<Partial<Record<ModuleKey, boolean>>>(
    () => parseEnabledModules(initial.enabledModules),
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Resolved on/off state = vertical defaults merged with explicit overrides.
  const resolved = useMemo(
    () => moduleMap(vertical, JSON.stringify(overrides)),
    [vertical, overrides],
  );

  function toggleModule(mod: ModuleKey) {
    setOverrides((prev) => ({ ...prev, [mod]: !resolved[mod] }));
    setMsg(null);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      // Write the full explicit map (simplest + unambiguous): every module's
      // current resolved boolean, so what the owner sees is exactly persisted.
      const explicit: Record<string, boolean> = {};
      for (const m of ALL_MODULES) explicit[m] = resolved[m];

      const r = await fetch("/api/settings/business-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessType: vertical,
          enabledModules: JSON.stringify(explicit),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "خطأ في الحفظ");
      // Re-seed overrides from what we just saved so state stays consistent.
      setOverrides(explicit as Partial<Record<ModuleKey, boolean>>);
      setMsg({ ok: true, text: "تم الحفظ بنجاح" });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || "خطأ في الحفظ" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Business type */}
      <div>
        <label className="block text-sm font-medium mb-2">نوع النشاط</label>
        <p className="text-xs text-slate-400 mb-3">
          يحدد نوع النشاط الوحدات المفعّلة افتراضياً في مساحة العمل. يمكنك تخصيص كل وحدة بالأسفل.
        </p>
        <select
          value={vertical}
          onChange={(e) => {
            setVertical(resolveVertical(e.target.value));
            setMsg(null);
          }}
          className="input w-full max-w-xs"
        >
          {VERTICALS.map((v) => (
            <option key={v.key} value={v.key}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {/* Workspace modules */}
      <div>
        <label className="block text-sm font-medium mb-2">وحدات مساحة العمل</label>
        <p className="text-xs text-slate-400 mb-3">
          فعّل أو عطّل كل وحدة. الوحدة المعطّلة تختفي من كل مكان (القائمة الجانبية، لوحة التحكم، التقارير).
        </p>
        <div className="space-y-2">
          {ALL_MODULES.map((mod) => (
            <div
              key={mod}
              className="flex items-center justify-between p-3 rounded-lg border border-white/10"
            >
              <div className="text-sm font-medium">{MODULE_LABELS[mod]}</div>
              <button
                type="button"
                onClick={() => toggleModule(mod)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${resolved[mod] ? "bg-brand-500" : "bg-white/20"}`}
                aria-pressed={resolved[mod]}
                aria-label={MODULE_LABELS[mod]}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${resolved[mod] ? "-translate-x-6" : "-translate-x-1"}`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "جاري الحفظ..." : "حفظ"}
        </button>
        {msg && (
          <span className={`text-sm ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
