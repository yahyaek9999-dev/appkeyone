"use client";

import { useMemo, useState } from "react";
import { Brain, Search, FileText, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

type Tenant = {
  id: string;
  email: string;
  name: string | null;
  knowledgeBrainEnabled: boolean;
  docCount: number;
};

export default function KnowledgeBrainAdminUi({
  initialUsers,
}: {
  initialUsers: Tenant[];
}) {
  const [users, setUsers] = useState<Tenant[]>(initialUsers);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.name || "").toLowerCase().includes(q),
    );
  }, [users, query]);

  const stats = useMemo(() => {
    const enabled = users.filter((u) => u.knowledgeBrainEnabled).length;
    const totalDocs = users.reduce((s, u) => s + u.docCount, 0);
    return { total: users.length, enabled, totalDocs };
  }, [users]);

  async function toggle(target: Tenant) {
    const next = !target.knowledgeBrainEnabled;
    setError(null);
    setPendingId(target.id);
    // Optimistic update.
    setUsers((prev) =>
      prev.map((u) =>
        u.id === target.id ? { ...u, knowledgeBrainEnabled: next } : u,
      ),
    );
    try {
      const res = await fetch("/api/admin/knowledge-brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: target.id, enabled: next }),
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("save-failed");
      }
    } catch {
      // Revert on failure.
      setUsers((prev) =>
        prev.map((u) =>
          u.id === target.id ? { ...u, knowledgeBrainEnabled: !next } : u,
        ),
      );
      setError("تعذر حفظ التغيير. حاول مرة أخرى.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Summary tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile
          icon={<Brain className="h-4 w-4" />}
          label="التجار"
          value={stats.total.toLocaleString("en-US")}
          accent="border-brand-500/20 text-brand-400"
        />
        <Tile
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="مُفعّل العقل المعرفي"
          value={stats.enabled.toLocaleString("en-US")}
          accent="border-emerald-500/20 text-emerald-400"
        />
        <Tile
          icon={<FileText className="h-4 w-4" />}
          label="إجمالي المستندات"
          value={stats.totalDocs.toLocaleString("en-US")}
          accent="border-amber-500/20 text-amber-400"
        />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث بالبريد أو الاسم…"
          className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pr-10 pl-3 text-sm text-white placeholder:text-slate-500 focus:border-brand-400/40 focus:outline-none"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-3 py-2 text-sm text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="card p-5">
        <h2 className="section-title mb-4">التجار</h2>
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            {users.length === 0
              ? "لا يوجد تجار بعد."
              : "لا توجد نتائج مطابقة للبحث."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-slate-400">
                  <th className="p-2 text-right">التاجر</th>
                  <th className="p-2 text-right">المستندات</th>
                  <th className="p-2 text-right">الحالة</th>
                  <th className="p-2 text-right">العقل المعرفي</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-t border-white/5">
                    <td className="p-2">
                      <div className="max-w-[220px] truncate font-semibold text-white">
                        {u.name || "—"}
                      </div>
                      <div className="max-w-[220px] truncate font-mono text-[10px] text-slate-500">
                        {u.email}
                      </div>
                    </td>
                    <td className="p-2">
                      <span className="inline-flex items-center gap-1 text-slate-300">
                        <FileText className="h-3.5 w-3.5 text-slate-500" />
                        {u.docCount.toLocaleString("en-US")}
                      </span>
                    </td>
                    <td className="p-2">
                      {u.knowledgeBrainEnabled ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/[0.08] px-2 py-0.5 text-xs text-emerald-300">
                          مُفعّل
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs text-slate-400">
                          موقوف
                        </span>
                      )}
                    </td>
                    <td className="p-2">
                      <Toggle
                        on={u.knowledgeBrainEnabled}
                        loading={pendingId === u.id}
                        onClick={() => toggle(u)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-slate-500">
          عند الإيقاف لا يُستخدم العقل المعرفي للتاجر في الردود؛ المستندات تبقى
          محفوظة ولا تُحذف.
        </p>
      </div>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="kpi-card">
      <div className={`kpi-icon border ${accent}`}>{icon}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

function Toggle({
  on,
  loading,
  onClick,
}: {
  on: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      role="switch"
      aria-checked={on}
      className={
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-60 " +
        (on ? "bg-emerald-500/70" : "bg-white/15")
      }
    >
      <span
        className={
          "inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow transition-transform " +
          (on ? "-translate-x-0.5" : "-translate-x-[22px]")
        }
      >
        {loading && <Loader2 className="h-3 w-3 animate-spin text-slate-500" />}
      </span>
    </button>
  );
}
