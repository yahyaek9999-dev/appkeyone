"use client";
import { useEffect, useState } from "react";
import { Truck, Plus, Loader2, Trash2, Plug } from "lucide-react";

type Provider = {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  isDefault: boolean;
  hasCredentials: boolean;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
};

const TYPES: [string, string][] = [
  ["bosta", "Bosta"],
  ["aramex", "Aramex"],
  ["mylerz", "Mylerz"],
  ["smsa", "SMSA"],
  ["manual", "يدوي (إدخال يدوي)"],
];

export default function ShippingProviders() {
  const [items, setItems] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // create form
  const [type, setType] = useState("manual");
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [account, setAccount] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/shipping/providers", { cache: "no-store" });
      const j = await r.json();
      setItems(j.items || []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!name.trim()) {
      setMsg({ kind: "err", text: "أدخل اسم المزوّد" });
      return;
    }
    setCreating(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/shipping/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name,
          apiKey: apiKey || undefined,
          apiSecret: apiSecret || undefined,
          account: account || undefined,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setMsg({ kind: "err", text: j.error || "فشل الإضافة" });
        return;
      }
      setName("");
      setApiKey("");
      setApiSecret("");
      setAccount("");
      setType("manual");
      setMsg({ kind: "ok", text: "تمت إضافة المزوّد" });
      load();
    } finally {
      setCreating(false);
    }
  }

  async function patch(id: string, body: any) {
    setBusy(id);
    try {
      await fetch(`/api/admin/shipping/providers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      load();
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("حذف هذا المزوّد؟")) return;
    setBusy(id);
    try {
      await fetch(`/api/admin/shipping/providers/${id}`, { method: "DELETE" });
      load();
    } finally {
      setBusy(null);
    }
  }

  async function test(id: string) {
    setBusy(id);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/shipping/providers/${id}/test`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      setMsg({
        kind: j.ok ? "ok" : "err",
        text: j.detail || (j.ok ? "اتصال ناجح" : "فشل الاتصال"),
      });
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {msg && (
        <div
          className={`rounded-xl border p-3 text-sm ${msg.kind === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-rose-500/30 bg-rose-500/10 text-rose-200"}`}
        >
          {msg.text}
        </div>
      )}

      {/* Add provider */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 font-medium text-slate-200">
          <Plus className="w-4 h-4" /> إضافة مزوّد شحن
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-slate-400 mb-1 block">المزوّد</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
            >
              {TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400 mb-1 block">الاسم</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: Bosta - حسابي"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          {type !== "manual" && (
            <>
              <label className="block">
                <span className="text-xs text-slate-400 mb-1 block">API Key</span>
                <input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  type="password"
                  dir="ltr"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400 mb-1 block">API Secret (اختياري)</span>
                <input
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  type="password"
                  dir="ltr"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400 mb-1 block">
                  رقم الحساب / Account (اختياري)
                </span>
                <input
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  dir="ltr"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                />
              </label>
            </>
          )}
        </div>
        <button
          onClick={create}
          disabled={creating}
          className="px-5 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{" "}
          إضافة
        </button>
      </div>

      {/* List */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="border-b border-white/10 p-4 font-bold flex items-center gap-2">
          <Truck className="w-4 h-4 text-brand-400" /> المزوّدون ({items.length})
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-400">
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400">لا يوجد مزوّدون بعد.</div>
        ) : (
          items.map((p) => (
            <div
              key={p.id}
              className="border-t border-white/5 p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <div className="font-semibold flex items-center gap-2">
                  {p.name}
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-400">
                    {p.type}
                  </span>
                  {p.isDefault && (
                    <span className="rounded-full border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[10px] text-brand-300">
                      افتراضي
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {p.type === "manual"
                    ? "يدوي"
                    : p.hasCredentials
                      ? "مفاتيح محفوظة"
                      : "بدون مفاتيح"}
                  {p.lastTestAt && (
                    <span
                      className={p.lastTestOk ? "text-emerald-300 mr-2" : "text-amber-300 mr-2"}
                    >
                      {" "}
                      · آخر اختبار: {p.lastTestOk ? "ناجح" : "غير مؤكد"}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => test(p.id)}
                  disabled={busy === p.id}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-xs inline-flex items-center gap-1"
                >
                  <Plug className="w-3 h-3" /> اختبار
                </button>
                <button
                  onClick={() => patch(p.id, { enabled: !p.enabled })}
                  disabled={busy === p.id}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs ${p.enabled ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200" : "bg-white/5 border-white/10 text-slate-300"}`}
                >
                  {p.enabled ? "مفعّل" : "موقوف"}
                </button>
                <button
                  onClick={() => patch(p.id, { isDefault: true })}
                  disabled={busy === p.id || p.isDefault}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-xs disabled:opacity-40"
                >
                  تعيين افتراضي
                </button>
                <button
                  onClick={() => remove(p.id)}
                  disabled={busy === p.id}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 hover:bg-rose-500/20 text-xs inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> حذف
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
