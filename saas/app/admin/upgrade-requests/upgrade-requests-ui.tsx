"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";

interface UpReq {
  id: string;
  fromSlug: string;
  toSlug: string;
  billingCycle: string;
  status: string;
  note: string | null;
  contactPhone: string | null;
  createdAt: string;
  user: { email: string; name: string | null } | null;
}

export default function UpgradeRequestsUi() {
  const { success, error, info } = useToast();
  const [items, setItems] = useState<UpReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/upgrade-requests?status=${tab}`, { cache: "no-store" });
      const j = await r.json();
      setItems(j.items || []);
      if (j.pending) info("الجدول غير مفعّل بعد على هذا الخادم (شغّل الترحيل).");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  async function act(id: string, action: "activate" | "reject") {
    setBusy(id);
    try {
      const r = await fetch("/api/admin/upgrade-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const j = await r.json();
      if (r.ok) {
        success(action === "activate" ? `تم التفعيل: ${j.activated || ""}` : "تم الرفض");
        load();
      } else {
        error(j.error || "فشل التنفيذ");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["pending", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === t ? "border border-white/[0.08] bg-white/[0.06] text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            {t === "pending" ? "قيد الانتظار" : "الكل"}
          </button>
        ))}
      </div>

      {loading && <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">جارٍ التحميل...</div>}
      {!loading && items.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">لا توجد طلبات.</div>
      )}

      <div className="space-y-2">
        {items.map((r) => (
          <div key={r.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-white">{r.user?.email || r.user?.name || "—"}</span>
                <span className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-slate-400">
                  {r.fromSlug || "—"} → <span className="text-brand-300">{r.toSlug}</span>
                </span>
                <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-slate-500">
                  {r.billingCycle === "yearly" ? "سنوي" : "شهري"}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                  r.status === "pending" ? "bg-amber-500/15 text-amber-300" :
                  r.status === "activated" ? "bg-emerald-500/15 text-emerald-300" :
                  "bg-rose-500/15 text-rose-300"}`}>
                  {r.status === "pending" ? "بانتظار" : r.status === "activated" ? "مُفعّل" : "مرفوض"}
                </span>
              </div>
              {(r.note || r.contactPhone) && (
                <div className="mt-1 text-xs text-slate-500">
                  {r.contactPhone && <span>هاتف: {r.contactPhone} · </span>}
                  {r.note}
                </div>
              )}
            </div>
            {r.status === "pending" && (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => act(r.id, "activate")}
                  disabled={busy === r.id}
                  className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  تفعيل
                </button>
                <button
                  onClick={() => act(r.id, "reject")}
                  disabled={busy === r.id}
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                >
                  رفض
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
