"use client";

import { useState, useEffect, useCallback } from "react";
import { CreditCard, Plus, Star, FlaskConical, CheckCircle2, AlertCircle, Trash2, Edit2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface Gateway {
  id: string;
  adapter: string;
  name: string;
  hasCredentials: boolean;
  hasWebhookSecret: boolean;
  currencies: string;
  methods: string;
  health: "healthy" | "unhealthy" | "unknown";
  isDefault: boolean;
  isFallback: boolean;
  testMode: boolean;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  createdAt: string;
}

const ADAPTERS = ["stripe", "paypal", "hyperpay", "tap", "moyasar", "paytabs", "custom"];

const HEALTH_ICONS: Record<string, React.ReactNode> = {
  healthy:   <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  unhealthy: <AlertCircle className="h-4 w-4 text-red-500" />,
  unknown:   <AlertCircle className="h-4 w-4 text-slate-400" />,
};

export default function PaymentGatewaysPage() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const { success: toastSuccess, error: toastError } = useToast();

  // Create form
  const [adapter, setAdapter]           = useState("stripe");
  const [gwName, setGwName]             = useState("");
  const [testMode, setTestMode]         = useState(true);
  const [credJson, setCredJson]         = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [currencies, setCurrencies]     = useState("SAR,USD");
  const [methods, setMethods]           = useState("card");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/payment-gateways").catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setGateways(data.gateways || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!gwName.trim()) { toastError("الاسم مطلوب"); return; }
    let credentials: any = null;
    if (credJson.trim()) {
      try { credentials = JSON.parse(credJson); }
      catch { toastError("صيغة JSON غير صحيحة"); return; }
    }

    const res = await fetch("/api/admin/payment-gateways", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adapter,
        name: gwName,
        testMode,
        credentials,
        webhookSecret: webhookSecret || null,
        currencies: JSON.stringify(currencies.split(",").map(s => s.trim()).filter(Boolean)),
        methods: JSON.stringify(methods.split(",").map(s => s.trim()).filter(Boolean)),
      }),
    });
    const data = await res.json();
    if (data.ok) {
      toastSuccess("تم إضافة البوابة");
      setShowCreate(false);
      setGwName(""); setCredJson(""); setWebhookSecret(""); setCurrencies("SAR,USD"); setMethods("card"); setTestMode(true);
      load();
    } else {
      toastError(data.error || "فشل الإضافة");
    }
  }

  async function setDefault(id: string) {
    const res = await fetch(`/api/admin/payment-gateways/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    const data = await res.json();
    if (data.ok) {
      setGateways(prev => prev.map(g => ({ ...g, isDefault: g.id === id })));
      toastSuccess("تم تعيين البوابة الافتراضية");
    }
  }

  async function deleteGw(id: string) {
    const res = await fetch(`/api/admin/payment-gateways/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      setGateways(prev => prev.filter(g => g.id !== id));
      toastSuccess("تم حذف البوابة");
    } else {
      toastError(data.error || "لا يمكن حذف البوابة الافتراضية");
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">بوابات الدفع</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {gateways.length} بوابة مُعدّة — البيانات السرية مشفّرة دائماً
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> إضافة بوابة
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="border border-border rounded-xl p-5 space-y-4 bg-muted/20">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" /> بوابة جديدة
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">المعالج (Adapter)</label>
              <select value={adapter} onChange={e => setAdapter(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              >
                {ADAPTERS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">الاسم *</label>
              <input value={gwName} onChange={e => setGwName(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                placeholder="Stripe — إنتاج"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">العملات (مفصولة بفاصلة)</label>
              <input value={currencies} onChange={e => setCurrencies(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background font-mono"
                placeholder="SAR, USD, AED"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">طرق الدفع</label>
              <input value={methods} onChange={e => setMethods(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background font-mono"
                placeholder="card, apple_pay, stc_pay"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              بيانات الاعتماد (JSON — ستُشفَّر عند الحفظ)
            </label>
            <textarea
              value={credJson}
              onChange={e => setCredJson(e.target.value)}
              rows={4}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background font-mono resize-none"
              placeholder='{ "secret_key": "sk_test_...", "publishable_key": "pk_test_..." }'
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Webhook Secret (اختياري — سيُشفَّر)
            </label>
            <input
              type="password"
              value={webhookSecret}
              onChange={e => setWebhookSecret(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="whsec_..."
            />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)} className="rounded" />
            وضع الاختبار (Test Mode)
          </label>

          <div className="flex gap-2 pt-1">
            <button onClick={create} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
              إضافة البوابة
            </button>
            <button onClick={() => setShowCreate(false)} className="border border-border px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Gateways list */}
      {loading ? (
        <div className="text-sm text-muted-foreground animate-pulse">جاري التحميل...</div>
      ) : gateways.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">لا توجد بوابات مُعدّة بعد</p>
        </div>
      ) : (
        <div className="space-y-2">
          {gateways.map(g => (
            <div key={g.id} className={`border rounded-xl p-4 flex items-center gap-4 ${g.isDefault ? "border-primary/40 bg-primary/5" : "border-border"}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{g.name}</span>
                  <code className="text-xs bg-muted px-2 py-0.5 rounded">{g.adapter}</code>
                  {g.isDefault && <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">افتراضية</span>}
                  {g.isFallback && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 text-xs">احتياطية</span>}
                  {g.testMode && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs flex items-center gap-1"><FlaskConical className="h-3 w-3" />اختبار</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  {HEALTH_ICONS[g.health]}
                  <span>{g.health === "healthy" ? "صحية" : g.health === "unhealthy" ? "مشكلة" : "غير معروفة"}</span>
                  {g.hasCredentials && <span className="text-emerald-600">· بيانات اعتماد ✓</span>}
                  {g.hasWebhookSecret && <span className="text-emerald-600">· webhook ✓</span>}
                  {(() => {
                    try {
                      const curr = JSON.parse(g.currencies);
                      return curr.length ? <span>· {curr.join(", ")}</span> : null;
                    } catch { return null; }
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!g.isDefault && (
                  <button onClick={() => setDefault(g.id)} title="تعيين كافتراضية" className="p-1.5 hover:bg-primary/10 rounded text-muted-foreground hover:text-primary">
                    <Star className="h-4 w-4" />
                  </button>
                )}
                {!g.isDefault && (
                  <button onClick={() => deleteGw(g.id)} title="حذف" className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
