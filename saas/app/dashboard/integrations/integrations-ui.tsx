"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  KeyRound,
  Loader2,
  Mail,
  Plug,
  RotateCcw,
  Send,
  Settings2,
  Webhook,
  XCircle,
  ArrowLeft,
  RefreshCw,
  Link,
  Unlink,
  HelpCircle,
  RotateCw,
} from "lucide-react";
import { LiveBadge } from "@/components/ui/live-badge";
import { useRealtimeSnapshot } from "@/hooks/use-realtime";

type Integration = {
  id: string;
  name: string;
  platform: string;
  enabled: boolean;
  apiKeyMask: string;
  webhookUrl: string;
  nativeWebhookUrl?: string;
  setupMode?: string;
  connectionStatus?: string;
  lastSyncStatus?: string | null;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
  lastTestAt: string | null;
  lastEventAt: string | null;
  storeUrl?: string | null;
  counts?: { events?: number; orders?: number };
};

type EventLog = {
  id: string;
  source: string;
  eventType: string;
  externalOrderId: string | null;
  status: string;
  attempts: number;
  lastError: string | null;
  receivedAt: string;
};

const PLATFORM_LABEL: Record<string, string> = {
  custom: "موقع مخصص",
  woocommerce: "WooCommerce",
  shopify: "Shopify",
  salla: "سلة",
  zid: "Zid",
  api: "API",
};

const PLATFORM_HELP: Record<string, string[]> = {
  shopify: [
    "افتح متجر Shopify الخاص بك",
    "من الإعدادات → التطبيقات → تطوير التطبيق",
    "أنشئ Admin API integration",
    "انسخ Admin API access token والصقه في KEYONE",
    "اضغط اختبار الاتصال للتأكد",
  ],
  woocommerce: [
    "ادخل لوحة تحكم ووردبريس الخاصة بمتجر WooCommerce",
    "اذهب إلى WooCommerce → الإعدادات → Advanced → REST API",
    "أنشئ مفتاح API جديد بصلاحية Read/Write",
    "انسخ Consumer Key و Consumer Secret",
    "أدخل رابط متجرك والمفاتيح في KEYONE",
  ],
  salla: [
    "ادخل إلى لوحة تحكم متجرك في سلة",
    "اذهب إلى الإعدادات → التطبيقات → سوق التطبيقات",
    "ابحث عن KEYONE واتبع خطوات الربط",
    "بعد الموافقة، سيتم ربط المتجر تلقائياً",
  ],
  zid: [
    "تأكد من وجود حساب متجر على منصة Zid",
    "اذهب إلى الإعدادات → التطبيقات",
    "ابحث عن KEYONE في سوق التطبيقات",
    "اتبع خطوات الربط عبر OAuth",
  ],
  custom: [
    "أنشئ تكامل جديد بالضغط على الزر أدناه",
    "استخدم Webhook URL و API Key المقدمة",
    "أضف الرابط في إعدادات متجرك كـ Webhook",
    "أرسل طلب اختبار للتأكد من الاتصال",
  ],
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  untested: { label: "غير مُختبر", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  healthy: { label: "سليم", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  degraded: { label: "ضعيف", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  failed: { label: "فاشل", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
};

function connectionStatusLabel(item: Integration): string {
  if (item.connectionStatus === "healthy") return "متصل";
  if (item.connectionStatus === "degraded") return "ضعيف";
  if (item.connectionStatus === "failed") return "منفصل";
  return item.lastTestAt ? "تم الاختبار" : "غير مُختبر";
}

export default function IntegrationsUi() {
  const [items, setItems] = useState<Integration[]>([]);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("Website orders");
  const [platform, setPlatform] = useState("custom");
  const [storeUrl, setStoreUrl] = useState("");
  const [secret, setSecret] = useState<{
    apiKey: string;
    webhookSecret: string;
    webhookUrl: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [wizardPlatform, setWizardPlatform] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const { state: liveState, snapshot } = useRealtimeSnapshot({
    fallbackMs: 20000,
    onChange: (next, prev) => {
      if (!prev || next.latest.commerceEventAt !== prev.latest.commerceEventAt || next.latest.commerceNotificationAt !== prev.latest.commerceNotificationAt) load(false);
    },
  });

  const failedCount = snapshot?.totals.commerceFailedEvents || 0;
  const activeCount = snapshot?.totals.commerceIntegrations ?? items.filter((item) => item.enabled).length;

  function showSuccess(msg: string) { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 4000); }
  function showError(msg: string) { setError(msg); setTimeout(() => setError(null), 6000); }

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const [integrationsRes, eventsRes] = await Promise.all([
        fetch("/api/commerce/integrations", { cache: "no-store" }),
        fetch("/api/commerce/events?take=20", { cache: "no-store" }),
      ]);
      const integrationsJson = await integrationsRes.json();
      const eventsJson = await eventsRes.json();
      setItems(integrationsJson.items || []);
      setEvents(eventsJson.items || []);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function createIntegration() {
    if (!name.trim()) { showError("يرجى إدخال اسم التكامل"); return; }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/commerce/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), platform }),
      });
      const json = await res.json();
      if (!res.ok) { showError(json.error || "فشل إنشاء التكامل"); return; }
      setSecret({ apiKey: json.credentials.apiKey, webhookSecret: json.credentials.webhookSecret, webhookUrl: json.integration.webhookUrl });
      setName("Website orders");
      setPlatform("custom");
      setStoreUrl("");
      setWizardPlatform(null);
      showSuccess("تم إنشاء التكامل بنجاح!");
      await load(false);
    } finally { setCreating(false); }
  }

  async function toggle(item: Integration) {
    setBusyId(item.id);
    try {
      await fetch(`/api/commerce/integrations/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !item.enabled }) });
      showSuccess(item.enabled ? "تم إيقاف التكامل" : "تم تفعيل التكامل");
      await load(false);
    } finally { setBusyId(null); }
  }

  async function remove(item: Integration) {
    if (!confirm("سيتم فصل التكامل ولن تستقبل أحداث جديدة. متابعة؟")) return;
    setBusyId(item.id);
    try {
      await fetch(`/api/commerce/integrations/${item.id}`, { method: "DELETE" });
      showSuccess("تم فصل التكامل");
      await load(false);
    } finally { setBusyId(null); }
  }

  async function rotate(item: Integration) {
    if (!confirm("تدوير المفاتيح سيجعل المفاتيح القديمة غير صالحة. متابعة؟")) return;
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/commerce/integrations/${item.id}/rotate`, { method: "POST" });
      const json = await res.json();
      if (res.ok) setSecret({ apiKey: json.credentials.apiKey, webhookSecret: json.credentials.webhookSecret, webhookUrl: json.integration.webhookUrl });
      showSuccess("تم تدوير المفاتيح بنجاح");
      await load(false);
    } finally { setBusyId(null); }
  }

  async function test(item: Integration) {
    setBusyId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/commerce/integrations/${item.id}/test`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) showError(json.error || "فشل اختبار التكامل");
      else showSuccess("✅ تم اختبار الاتصال بنجاح!");
      await load(false);
    } finally { setBusyId(null); }
  }

  async function syncNow(item: Integration) {
    setBusyId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/commerce/integrations/${item.id}/sync`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) showError(json.error || "فشلت المزامنة");
      else showSuccess(`تمت المزامنة: ${json.synced || 0} حدث`);
      await load(false);
    } finally { setBusyId(null); }
  }

  async function retryEvent(eventId: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/commerce/events/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const json = await res.json();
      if (!res.ok) showError(json.error || "فشلت إعادة المحاولة");
      else showSuccess("تم إعادة معالجة الحدث");
      await load(false);
    } finally { setLoading(false); }
  }

  const curlExample = useMemo(() => {
    if (!secret) return "";
    return [
      `curl -X POST '${secret.webhookUrl}' \\`,
      `  -H 'Content-Type: application/json' \\`,
      `  -H 'X-Keyone-API-Key: ${secret.apiKey}' \\`,
      `  -H 'X-Keyone-Timestamp: <unix_timestamp>' \\`,
      `  -H 'X-Keyone-Signature: sha256=<hmac_sha256_body_with_webhook_secret>' \\`,
      `  -d '{"event":"order.created","order":{"id":"1001","customer":{"name":"Ali","phone":"+201000000000"},"items":[{"name":"Product","quantity":1,"price":100}],"total":100,"currency":"EGP"}}'`,
    ].join("\n");
  }, [secret]);

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Plug className="w-6 h-6 text-brand-400" />
            تكاملات التجارة
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            اربط متجرك الإلكتروني ليصلك تنبيهات الطلبات تلقائياً على واتساب.
          </p>
        </div>
        <LiveBadge state={liveState} label={`${activeCount} تكامل نشط`} />
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-200 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {successMsg}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Kpi icon={Webhook} label="تكاملات نشطة" value={activeCount} tone="emerald" />
        <Kpi icon={AlertTriangle} label="أحداث فاشلة" value={failedCount} tone={failedCount ? "rose" : "slate"} />
        <Kpi icon={Send} label="آخر حدث" value={snapshot?.latest.commerceEventAt ? new Date(snapshot.latest.commerceEventAt).toLocaleTimeString("ar-EG") : "—"} tone="sky" />
      </div>

      {secret && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
          <div className="font-bold text-amber-100 flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> احفظ المفاتيح الآن
          </div>
          <p className="text-xs text-amber-100/80">لن يتم عرض مفتاح الـ API أو سر التوقيع مرة أخرى بعد مغادرة هذه الرسالة.</p>
          <SecretBox label="Webhook URL" value={secret.webhookUrl} />
          <SecretBox label="API Key" value={secret.apiKey} />
          <SecretBox label="Webhook Secret" value={secret.webhookSecret} />
          <pre dir="ltr" className="overflow-x-auto rounded-xl bg-black/40 p-3 text-xs text-slate-200">{curlExample}</pre>
        </div>
      )}

      {wizardPlatform ? (
        <WizardView
          platform={wizardPlatform}
          storeUrl={storeUrl}
          setStoreUrl={setStoreUrl}
          onBack={() => setWizardPlatform(null)}
          onContinue={createIntegration}
          creating={creating}
          name={name}
          setName={setName}
        />
      ) : (
        <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
          <h2 className="font-bold mb-3 flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> ربط متجر جديد
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            اختر منصة متجرك الإلكتروني لبدء الربط. إذا كانت منصتك غير مدعومة، اختر "موقع مخصص" لاستخدام Webhook.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(PLATFORM_LABEL).filter(([k]) => k !== "custom" && k !== "api").map(([id, label]) => (
              <button
                key={id}
                onClick={() => { setWizardPlatform(id); setStoreUrl(""); setPlatform(id); }}
                className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-brand-500/10 hover:border-brand-500/30 transition text-center"
              >
                <div className="font-semibold text-sm">{label}</div>
                <div className="text-xs text-slate-500 mt-1">اربط متجرك</div>
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setWizardPlatform("custom")} className="px-4 py-2 rounded-lg border border-white/10 text-sm hover:bg-white/5">
              <Link className="w-3.5 h-3.5 inline ml-1" />
              موقع مخصص (API / Webhook)
            </button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-slate-900/40 overflow-hidden">
        <div className="border-b border-white/10 p-4 font-bold flex items-center justify-between">
          <span>التكاملات</span>
          <span className="text-xs text-slate-400 font-normal">{items.length} تكامل</span>
        </div>
        {loading && <div className="p-6 text-sm text-slate-400">جاري التحميل...</div>}
        {!loading && items.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-400">
            <Plug className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <div>لا توجد تكاملات بعد.</div>
            <div className="text-xs mt-1">اختر منصة أعلاه لربط متجرك.</div>
          </div>
        )}
        {items.map((item) => {
          const badge = STATUS_BADGE[item.connectionStatus || "untested"] || STATUS_BADGE.untested;
          const syncLabel = item.lastSyncStatus === "syncing" ? "جارٍ المزامنة..." : item.lastSyncAt ? `آخر مزامنة: ${new Date(item.lastSyncAt).toLocaleString("ar-EG")}` : "لم تتم المزامنة بعد";
          return (
            <div key={item.id} className="border-b border-white/5 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{item.name}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${badge.cls}`}>
                    {item.connectionStatus === "healthy" ? <CheckCircle2 className="w-3 h-3" /> : item.connectionStatus === "failed" ? <XCircle className="w-3 h-3" /> : <HelpCircle className="w-3 h-3" />}
                    {connectionStatusLabel(item)}
                  </span>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-400">{PLATFORM_LABEL[item.platform] || item.platform}</span>
                  {item.enabled ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
                      <CheckCircle2 className="w-3 h-3" /> نشط
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-0.5 text-xs text-slate-300">
                      <XCircle className="w-3 h-3" /> متوقف
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  طلبات: {item.counts?.orders || 0} · أحداث: {item.counts?.events || 0}
                  {item.lastSyncAt && <span> · {syncLabel}</span>}
                  {item.lastSyncError && <span className="text-rose-300 mr-2">خطأ: {item.lastSyncError}</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => test(item)} disabled={busyId === item.id} className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-xs inline-flex items-center gap-1" title="اختبار الاتصال">
                  {busyId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} اختبار
                </button>
                <button onClick={() => syncNow(item)} disabled={busyId === item.id} className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-xs inline-flex items-center gap-1" title="مزامنة الآن">
                  <RefreshCw className={`w-3 h-3 ${busyId === item.id ? "animate-spin" : ""}`} /> مزامنة
                </button>
                <button onClick={() => rotate(item)} disabled={busyId === item.id} className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-xs inline-flex items-center gap-1" title="تدوير المفاتيح">
                  <RotateCcw className="w-3 h-3" /> تدوير
                </button>
                <button onClick={() => toggle(item)} disabled={busyId === item.id} className={`px-2.5 py-1.5 rounded-lg border text-xs inline-flex items-center gap-1 ${item.enabled ? "bg-amber-500/10 border-amber-500/30 text-amber-200 hover:bg-amber-500/20" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/20"}`}>
                  {item.enabled ? "إيقاف" : "تفعيل"}
                </button>
                <button onClick={() => remove(item)} disabled={busyId === item.id} className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 hover:bg-rose-500/20 text-xs inline-flex items-center gap-1" title="فصل التكامل">
                  <Unlink className="w-3 h-3" /> فصل
                </button>
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/40 overflow-hidden">
        <div className="border-b border-white/10 p-4 font-bold">آخر أحداث المزامنة</div>
        {events.length === 0 && <div className="p-6 text-sm text-slate-400">لا توجد أحداث بعد.</div>}
        {events.map((event) => (
          <div key={event.id} className="border-b border-white/5 p-4 text-sm flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-mono text-xs text-slate-300" dir="ltr">{event.eventType} · {event.externalOrderId || "—"}</div>
              {event.lastError && <div className="text-xs text-rose-300 mt-1">{event.lastError}</div>}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <EventStatus status={event.status} />
              <span>{new Date(event.receivedAt).toLocaleString("ar-EG")}</span>
              {event.status === "failed" && (
                <button onClick={() => retryEvent(event.id)} disabled={loading} className="px-2 py-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs hover:bg-amber-500/25 inline-flex items-center gap-1">
                  <RotateCw className="w-3 h-3" /> إعادة
                </button>
              )}
            </div>
          </div>
        ))}
      </section>

      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
        <h2 className="font-bold mb-2 flex items-center gap-2 text-sm">
          <Mail className="w-4 h-4" /> البريد الإلكتروني
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          إشعارات البريد الإلكتروني متاحة عبر إعدادات مزوّد البريد. يمكنك ربط SMTP أو Resend أو Brevo لإرسال إشعارات الطلبات عبر الإيميل للعملاء.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
        <h2 className="font-bold mb-2 flex items-center gap-2 text-sm text-amber-200">
          <HelpCircle className="w-4 h-4" /> مساعدة سريعة
        </h2>
        <ul className="text-xs text-slate-400 space-y-1.5 leading-relaxed">
          <li>• <strong>اختبار الاتصال:</strong> يرسل طلب اختبار للتأكد من أن المتجر يستقبل الأحداث.</li>
          <li>• <strong>مزامنة:</strong> يسحب آخر الطلبات من المتجر بشكل يدوي.</li>
          <li>• <strong>تدوير المفاتيح:</strong> يولّد مفتاح API وسر Webhook جديدين. المفاتيح القديمة تتوقف فوراً.</li>
          <li>• <strong>فصل:</strong> يوقف استقبال الأحداث من المتجر دون حذف البيانات السابقة.</li>
          <li>• <strong>تفعيل/إيقاف:</strong> تحكم مؤقت في استقبال الأحداث.</li>
        </ul>
      </div>
    </div>
  );
}

function WizardView({
  platform, storeUrl, setStoreUrl, onBack, onContinue, creating, name, setName,
}: {
  platform: string; storeUrl: string; setStoreUrl: (v: string) => void;
  onBack: () => void; onContinue: () => void; creating: boolean;
  name: string; setName: (v: string) => void;
}) {
  const steps = PLATFORM_HELP[platform] || PLATFORM_HELP.custom;
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Plug className="w-5 h-5 text-brand-400" />
          ربط {PLATFORM_LABEL[platform]}
        </h2>
        <button onClick={onBack} className="text-sm text-slate-400 hover:text-white flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> رجوع
        </button>
      </div>

      <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-4">
        <h3 className="font-semibold text-sm mb-3">خطوات الربط:</h3>
        <ol className="space-y-2 text-sm text-slate-300">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-300 text-xs flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>

      {platform !== "custom" && (
        <div>
          <label className="text-sm text-slate-400 mb-1 block">رابط المتجر (اختياري)</label>
          <input
            value={storeUrl} onChange={(e) => setStoreUrl(e.target.value)}
            placeholder={platform === "shopify" ? "my-store.myshopify.com" : platform === "woocommerce" ? "my-store.com" : "salla.sa/store-name"}
            dir="ltr"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-400"
          />
          <p className="text-xs text-slate-500 mt-1">أدخل رابط متجرك ليساعدنا في تهيئة الاتصال بشكل أسرع.</p>
        </div>
      )}

      <div>
        <label className="text-sm text-slate-400 mb-1 block">اسم التكامل (للتمييز)</label>
        <input
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder="مثال: متجري على Shopify"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-400"
        />
      </div>

      <div className="flex gap-2">
        <button onClick={onContinue} disabled={creating || !name.trim()} className="px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium inline-flex items-center gap-2">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
          {creating ? "جاري الربط..." : "ربط المتجر"}
        </button>
        <button onClick={onBack} className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm">إلغاء</button>
      </div>
    </div>
  );
}

function SecretBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="mb-1 text-xs text-slate-400">{label}</div>
      <div className="flex items-center gap-2">
        <code dir="ltr" className="min-w-0 flex-1 truncate text-xs text-slate-100">{value}</code>
        <button onClick={() => navigator.clipboard.writeText(value)} className="rounded-lg border border-white/10 p-1.5 text-slate-300 hover:text-white">
          <Clipboard className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

const EVENT_STATUS_LABELS: Record<string, string> = {
  processed: "تمت المعالجة",
  failed: "فاشل",
  received: "مستلم",
  retrying: "إعادة محاولة",
};

function EventStatus({ status }: { status: string }) {
  const cls = status === "processed" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : status === "failed" ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return <span className={`rounded-full border px-2 py-0.5 ${cls}`}>{EVENT_STATUS_LABELS[status] || status}</span>;
}

function Kpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: any; tone: string }) {
  const tones: Record<string, string> = { emerald: "from-emerald-500/10 to-emerald-500/0 border-emerald-500/30 text-emerald-200", rose: "from-rose-500/10 to-rose-500/0 border-rose-500/30 text-rose-200", slate: "from-slate-500/10 to-slate-500/0 border-slate-500/30 text-slate-200", sky: "from-sky-500/10 to-sky-500/0 border-sky-500/30 text-sky-200" };
  return (
    <div className={`rounded-2xl border bg-gradient-to-bl p-4 ${tones[tone] || tones.slate}`}>
      <div className="flex items-center justify-between text-xs opacity-80">
        <span>{label}</span>
        <Icon className="w-4 h-4" />
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
