"use client";

// Shipping & Tracking — customer surface over the existing shipment API.
// Talks only to /api/shipments and /api/shipments/[id]/action; no new backend.

import { useEffect, useState } from "react";
import { Truck, Plus, Loader2, RefreshCw, BellRing, PackageCheck } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";

type Provider = { id: string; name: string; type: string };
type TimelineEvent = { status: string; note?: string; at?: string };
type Shipment = {
  id: string;
  orderId: string;
  providerType: string;
  trackingNumber: string | null;
  status: string;
  timeline: TimelineEvent[];
  lastSyncAt: string | null;
  createdAt: string;
};
type OrderRow = {
  id: string;
  customerName: string | null;
  total: number | null;
  currency: string | null;
  status: string;
};

// Mirrors SHIPMENT_STATUS_LABEL in lib/shipping.ts. Inlined because that module
// imports prisma and cannot be pulled into a client component.
const STATUS_LABEL: Record<string, string> = {
  created: "تم الإنشاء",
  picked_up: "تم الاستلام",
  in_transit: "في الطريق",
  out_for_delivery: "خرج للتسليم",
  delivered: "تم التسليم",
  returned: "مُرتجع",
  canceled: "ملغي",
};
const STATUSES = Object.keys(STATUS_LABEL);

const STATUS_TONE: Record<string, string> = {
  created: "border-slate-500/25 bg-slate-500/10 text-slate-200",
  picked_up: "border-sky-500/25 bg-sky-500/10 text-sky-200",
  in_transit: "border-sky-500/25 bg-sky-500/10 text-sky-200",
  out_for_delivery: "border-amber-500/25 bg-amber-500/10 text-amber-200",
  delivered: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
  returned: "border-rose-500/25 bg-rose-500/10 text-rose-200",
  canceled: "border-rose-500/25 bg-rose-500/10 text-rose-200",
};

export default function ShipmentsUi() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [orderId, setOrderId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [tracking, setTracking] = useState("");
  const [creating, setCreating] = useState(false);

  const { success, error: toastError } = useToast();

  async function load() {
    try {
      const r = await fetch("/api/shipments", { cache: "no-store" });
      const j = await r.json();
      setShipments(j.shipments || []);
      setProviders(j.providers || []);
      if (!providerId && j.providers?.[0]) setProviderId(j.providers[0].id);
    } catch {
      toastError("تعذّر تحميل الشحنات");
    } finally {
      setLoading(false);
    }
  }

  async function loadOrders() {
    try {
      const r = await fetch("/api/orders?take=50", { cache: "no-store" });
      const j = await r.json();
      setOrders(j.items || []);
    } catch {
      /* order picker is optional — the id field still works */
    }
  }

  useEffect(() => {
    load();
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    if (!orderId.trim() || !providerId) {
      toastError("اختر الطلب ومزوّد الشحن");
      return;
    }
    setCreating(true);
    try {
      const r = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: orderId.trim(),
          providerId,
          trackingNumber: tracking.trim() || undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toastError(j.error || "تعذّر إنشاء الشحنة");
        return;
      }
      success(j.detail || "تم إنشاء الشحنة");
      setOrderId("");
      setTracking("");
      load();
    } finally {
      setCreating(false);
    }
  }

  async function act(id: string, action: "sync" | "notify" | "status", status?: string) {
    setBusy(id);
    try {
      const r = await fetch(`/api/shipments/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, status }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.ok) success(j.detail || "تم"); else toastError(j.detail || j.error || "تعذّر التنفيذ");
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <h1 className="page-title mb-1">الشحن والتتبّع</h1>
        <p className="page-desc">
          أنشئ شحنة لأي طلب، تابع حالتها، وحدّث العميل. تُحدَّث حالة الطلب تلقائياً مع كل تغيير.
        </p>
      </div>

      {/* Create */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2 font-medium text-slate-200">
          <Plus className="w-4 h-4" /> شحنة جديدة
        </div>
        {providers.length === 0 ? (
          <p className="text-sm text-amber-200/90">
            لا يوجد مزوّد شحن مُفعّل على حسابك بعد. تعاقدات شركات الشحن تُدار من
            فريق KEYONE —{" "}
            <a href="/support" className="underline hover:text-amber-100">
              تواصل مع الدعم
            </a>{" "}
            لتفعيل مزوّد شحن، وستتمكّن بعدها من إنشاء الشحنات ومتابعتها من هنا.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs text-slate-400 mb-1 block">الطلب</span>
              {orders.length > 0 ? (
                <select
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">— اختر طلباً —</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {(o.customerName || "عميل").slice(0, 24)} — {o.total ?? 0} {o.currency || "EGP"}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="معرّف الطلب"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                />
              )}
            </label>
            <label className="block">
              <span className="text-xs text-slate-400 mb-1 block">مزوّد الشحن</span>
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400 mb-1 block">رقم التتبع (اختياري)</span>
              <input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="—"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
              />
            </label>
          </div>
        )}
        {providers.length > 0 && (
          <button
            onClick={create}
            disabled={creating}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
            إنشاء الشحنة
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : shipments.length === 0 ? (
        <EmptyState
          icon={<PackageCheck />}
          title="لا توجد شحنات بعد"
          description="أنشئ شحنة لأحد طلباتك لتبدأ متابعة التسليم من هنا."
        />
      ) : (
        <div className="space-y-3">
          {shipments.map((s) => (
            <div key={s.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${
                        STATUS_TONE[s.status] || STATUS_TONE.created
                      }`}
                    >
                      {STATUS_LABEL[s.status] || s.status}
                    </span>
                    <span className="text-[11px] text-slate-500">{s.providerType}</span>
                    <span className="text-[11px] text-slate-500">{fmtDate(s.createdAt)}</span>
                  </div>
                  {s.trackingNumber && (
                    <div className="font-mono text-[13px] text-white select-all mt-1">
                      {s.trackingNumber}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500 mt-0.5">طلب: {s.orderId}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={s.status}
                    disabled={busy === s.id}
                    onChange={(e) => act(s.id, "status", e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs"
                  >
                    {STATUSES.map((k) => (
                      <option key={k} value={k}>{STATUS_LABEL[k]}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => act(s.id, "sync")}
                    disabled={busy === s.id}
                    title="مزامنة من المزوّد"
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> مزامنة
                  </button>
                  <button
                    onClick={() => act(s.id, "notify")}
                    disabled={busy === s.id}
                    title="تعليم العميل كمُبلَّغ"
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50"
                  >
                    <BellRing className="w-3.5 h-3.5" /> إشعار
                  </button>
                </div>
              </div>

              {s.timeline?.length > 0 && (
                <ol className="border-t border-white/[0.05] pt-2.5 space-y-1.5">
                  {s.timeline.map((e, i) => (
                    <li key={i} className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-500/70 flex-shrink-0" />
                      <span className="text-slate-300">{e.note || STATUS_LABEL[e.status] || e.status}</span>
                      {e.at && <span className="text-slate-600">{fmtDate(e.at)}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
