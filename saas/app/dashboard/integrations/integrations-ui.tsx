"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  KeyRound,
  Loader2,
  Mail,
  Plug,
  RotateCcw,
  Send,
  Settings2,
  Webhook,
  XCircle,
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
  lastTestAt: string | null;
  lastEventAt: string | null;
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

export default function IntegrationsUi() {
  const [items, setItems] = useState<Integration[]>([]);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("Website orders");
  const [platform, setPlatform] = useState("custom");
  const [secret, setSecret] = useState<{
    apiKey: string;
    webhookSecret: string;
    webhookUrl: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { state: liveState, snapshot } = useRealtimeSnapshot({
    fallbackMs: 20000,
    onChange: (next, prev) => {
      if (
        !prev ||
        next.latest.commerceEventAt !== prev.latest.commerceEventAt ||
        next.latest.commerceNotificationAt !==
          prev.latest.commerceNotificationAt
      ) {
        load(false);
      }
    },
  });

  const failedCount = snapshot?.totals.commerceFailedEvents || 0;
  const activeCount =
    snapshot?.totals.commerceIntegrations ??
    items.filter((item) => item.enabled).length;

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
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createIntegration() {
    setCreating(true);
    try {
      const res = await fetch("/api/commerce/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, platform }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "فشل إنشاء التكامل");
        return;
      }
      setSecret({
        apiKey: json.credentials.apiKey,
        webhookSecret: json.credentials.webhookSecret,
        webhookUrl: json.integration.webhookUrl,
      });
      setName("Website orders");
      setPlatform("custom");
      await load(false);
    } finally {
      setCreating(false);
    }
  }

  async function toggle(item: Integration) {
    setBusyId(item.id);
    try {
      await fetch(`/api/commerce/integrations/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !item.enabled }),
      });
      await load(false);
    } finally {
      setBusyId(null);
    }
  }

  async function rotate(item: Integration) {
    if (!confirm("تدوير المفاتيح سيجعل المفاتيح القديمة غير صالحة. متابعة؟"))
      return;
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/commerce/integrations/${item.id}/rotate`, {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok)
        setSecret({
          apiKey: json.credentials.apiKey,
          webhookSecret: json.credentials.webhookSecret,
          webhookUrl: json.integration.webhookUrl,
        });
      await load(false);
    } finally {
      setBusyId(null);
    }
  }

  async function test(item: Integration) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/commerce/integrations/${item.id}/test`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) alert(json.error || "فشل اختبار التكامل");
      await load(false);
    } finally {
      setBusyId(null);
    }
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
            استقبل طلبات المواقع والمتاجر بدون إعادة بناء موقع العميل.
          </p>
        </div>
        <LiveBadge state={liveState} label={`${activeCount} تكامل نشط`} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Kpi
          icon={Webhook}
          label="تكاملات نشطة"
          value={activeCount}
          tone="emerald"
        />
        <Kpi
          icon={AlertTriangle}
          label="أحداث فاشلة"
          value={failedCount}
          tone={failedCount ? "rose" : "slate"}
        />
        <Kpi
          icon={Send}
          label="آخر حدث"
          value={
            snapshot?.latest.commerceEventAt
              ? new Date(snapshot.latest.commerceEventAt).toLocaleTimeString(
                  "ar-EG",
                )
              : "—"
          }
          tone="sky"
        />
      </div>

      {secret && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
          <div className="font-bold text-amber-100 flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> احفظ المفاتيح الآن
          </div>
          <p className="text-xs text-amber-100/80">
            لن يتم عرض مفتاح الـ API أو سر التوقيع مرة أخرى بعد مغادرة هذه
            الرسالة.
          </p>
          <SecretBox label="Webhook URL" value={secret.webhookUrl} />
          <SecretBox label="API Key" value={secret.apiKey} />
          <SecretBox label="Webhook Secret" value={secret.webhookSecret} />
          <pre
            dir="ltr"
            className="overflow-x-auto rounded-xl bg-black/40 p-3 text-xs text-slate-200"
          >
            {curlExample}
          </pre>
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <Settings2 className="w-4 h-4" /> إنشاء تكامل جديد
        </h2>
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-brand-400"
            placeholder="اسم التكامل"
          />
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-brand-400"
          >
            {Object.entries(PLATFORM_LABEL).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <button
            onClick={createIntegration}
            disabled={creating || !name.trim()}
            className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "إنشاء"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/40 overflow-hidden">
        <div className="border-b border-white/10 p-4 font-bold">التكاملات</div>
        {loading && (
          <div className="p-6 text-sm text-slate-400">جاري التحميل...</div>
        )}
        {!loading && items.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-400">
            لا توجد تكاملات بعد.
          </div>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="border-b border-white/5 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{item.name}</span>
                <Status enabled={item.enabled} />
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-400">
                  {PLATFORM_LABEL[item.platform] || item.platform}
                </span>
              </div>
              <div dir="ltr" className="mt-2 truncate text-xs text-slate-500">
                {item.webhookUrl}
              </div>
              {item.nativeWebhookUrl && (
                <div dir="ltr" className="mt-1 truncate text-xs text-slate-600">
                  Native: {item.nativeWebhookUrl}
                </div>
              )}
              <div className="mt-1 text-xs text-slate-500">
                طلبات: {item.counts?.orders || 0} · أحداث:{" "}
                {item.counts?.events || 0} · الحالة:{" "}
                {item.connectionStatus || "untested"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => test(item)}
                disabled={busyId === item.id}
                className="btn-secondary"
              >
                <Send className="w-3 h-3" /> اختبار
              </button>
              <button
                onClick={() => rotate(item)}
                disabled={busyId === item.id}
                className="btn-secondary"
              >
                <RotateCcw className="w-3 h-3" /> تدوير
              </button>
              <button
                onClick={() => toggle(item)}
                disabled={busyId === item.id}
                className="btn-secondary"
              >
                {item.enabled ? "تعطيل" : "تفعيل"}
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/40 overflow-hidden">
        <div className="border-b border-white/10 p-4 font-bold">
          آخر أحداث المزامنة
        </div>
        {events.length === 0 && (
          <div className="p-6 text-sm text-slate-400">لا توجد أحداث بعد.</div>
        )}
        {events.map((event) => (
          <div
            key={event.id}
            className="border-b border-white/5 p-4 text-sm flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <div className="font-mono text-xs text-slate-300" dir="ltr">
                {event.eventType} · {event.externalOrderId || "—"}
              </div>
              {event.lastError && (
                <div className="text-xs text-rose-300 mt-1">
                  {event.lastError}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <EventStatus status={event.status} />
              <span>{new Date(event.receivedAt).toLocaleString("ar-EG")}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
        <h2 className="font-bold mb-2 flex items-center gap-2">
          <Mail className="w-4 h-4" /> البريد الإلكتروني
        </h2>
        <p className="text-sm text-slate-400">
          إعدادات مزودي البريد والقوالب متاحة عبر APIs الآن. إرسال البريد
          وواتساب للتجارة يبقى متوقفاً افتراضياً حتى تفعّل القوالب المناسبة.
        </p>
      </section>
    </div>
  );
}

function SecretBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="mb-1 text-xs text-slate-400">{label}</div>
      <div className="flex items-center gap-2">
        <code
          dir="ltr"
          className="min-w-0 flex-1 truncate text-xs text-slate-100"
        >
          {value}
        </code>
        <button
          onClick={() => navigator.clipboard.writeText(value)}
          className="rounded-lg border border-white/10 p-1.5 text-slate-300 hover:text-white"
        >
          <Clipboard className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function Status({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
      <CheckCircle2 className="w-3 h-3" /> نشط
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-0.5 text-xs text-slate-300">
      <XCircle className="w-3 h-3" /> متوقف
    </span>
  );
}

function EventStatus({ status }: { status: string }) {
  const cls =
    status === "processed"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : status === "failed"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
        : "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return (
    <span className={`rounded-full border px-2 py-0.5 ${cls}`}>{status}</span>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: any;
  tone: string;
}) {
  const tones: Record<string, string> = {
    emerald:
      "from-emerald-500/10 to-emerald-500/0 border-emerald-500/30 text-emerald-200",
    rose: "from-rose-500/10 to-rose-500/0 border-rose-500/30 text-rose-200",
    slate:
      "from-slate-500/10 to-slate-500/0 border-slate-500/30 text-slate-200",
    sky: "from-sky-500/10 to-sky-500/0 border-sky-500/30 text-sky-200",
  };
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-bl p-4 ${tones[tone] || tones.slate}`}
    >
      <div className="flex items-center justify-between text-xs opacity-80">
        <span>{label}</span>
        <Icon className="w-4 h-4" />
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
