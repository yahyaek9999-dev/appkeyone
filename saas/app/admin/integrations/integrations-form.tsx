"use client";
import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Sparkles, Plug, CheckCircle2, XCircle } from "lucide-react";

type MaskedSecret = { mask: string; hasValue: boolean };
type Data = {
  meta: {
    appId: string;
    businessId: string;
    phoneNumberId: string;
    accessToken: MaskedSecret;
    appSecret: MaskedSecret;
  };
  ai: { defaultProvider: string; openai: MaskedSecret; claude: MaskedSecret; gemini: MaskedSecret };
};

export default function AdminIntegrationsForm() {
  const [data, setData] = useState<Data | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Meta inputs
  const [metaAppId, setMetaAppId] = useState("");
  const [metaBusinessId, setMetaBusinessId] = useState("");
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState("");
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [metaAppSecret, setMetaAppSecret] = useState("");
  const [metaStatus, setMetaStatus] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // AI inputs
  const [defaultAiProvider, setDefaultAiProvider] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [claudeKey, setClaudeKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [aiStatus, setAiStatus] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/admin/integrations", { cache: "no-store" });
    const j = await r.json();
    if (j.ok) {
      setData(j);
      setMetaAppId(j.meta.appId);
      setMetaBusinessId(j.meta.businessId);
      setMetaPhoneNumberId(j.meta.phoneNumberId);
      setDefaultAiProvider(j.ai.defaultProvider);
    }
  }
  useEffect(() => {
    load();
  }, []);

  // Persist the current form values (shared by Save + Verify so verifying
  // always runs against the latest entered credentials, not a stale/empty DB).
  async function persist(): Promise<{ ok: boolean; error?: string }> {
    const r = await fetch("/api/admin/integrations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metaAppId,
        metaBusinessId,
        metaPhoneNumberId,
        metaAccessToken: metaAccessToken || undefined,
        metaAppSecret: metaAppSecret || undefined,
        defaultAiProvider,
        openaiKey: openaiKey || undefined,
        claudeKey: claudeKey || undefined,
        geminiKey: geminiKey || undefined,
      }),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, error: j.error };
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await persist();
      if (res.ok) {
        setMsg({ kind: "ok", text: "تم الحفظ ✓" });
        setMetaAccessToken("");
        setMetaAppSecret("");
        setOpenaiKey("");
        setClaudeKey("");
        setGeminiKey("");
        load();
      } else setMsg({ kind: "err", text: res.error || "فشل الحفظ" });
    } finally {
      setSaving(false);
    }
  }

  async function verifyMeta() {
    setVerifying(true);
    setMetaStatus(null);
    try {
      // Save first so the verify endpoint reads the credentials just entered.
      const saved = await persist();
      if (!saved.ok) {
        setMetaStatus(`error:${saved.error || "تعذّر حفظ البيانات قبل التحقق"}`);
        return;
      }
      const r = await fetch("/api/admin/integrations/verify-meta", { method: "POST" });
      const j = await r.json();
      setMetaStatus(
        j.ok
          ? `connected:${j.displayPhone || ""} · ${j.qualityRating || ""}`
          : `${j.status}:${j.message || ""}`,
      );
      load();
    } catch {
      setMetaStatus("error:تعذّر الاتصال");
    } finally {
      setVerifying(false);
    }
  }

  async function testAi(provider: string) {
    setTesting(provider);
    setAiStatus((s) => ({ ...s, [provider]: "" }));
    try {
      const key = provider === "openai" ? openaiKey : provider === "claude" ? claudeKey : geminiKey;
      const r = await fetch("/api/admin/integrations/test-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key: key || undefined }),
      });
      const j = await r.json();
      setAiStatus((s) => ({ ...s, [provider]: j.ok ? "connected" : "failed:" + (j.error || "") }));
    } catch {
      setAiStatus((s) => ({ ...s, [provider]: "failed:network" }));
    } finally {
      setTesting(null);
    }
  }

  if (!data)
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Meta card */}
      <div className="card p-5 space-y-3">
        <h2 className="section-title flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-emerald-300" /> Meta / WhatsApp Cloud
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <F label="Meta App ID" value={metaAppId} onChange={setMetaAppId} />
          <F label="Business ID (WABA)" value={metaBusinessId} onChange={setMetaBusinessId} />
          <F label="Phone Number ID" value={metaPhoneNumberId} onChange={setMetaPhoneNumberId} />
          <S
            label="Access Token"
            mask={data.meta.accessToken}
            value={metaAccessToken}
            onChange={setMetaAccessToken}
          />
          <S
            label="App Secret"
            mask={data.meta.appSecret}
            value={metaAppSecret}
            onChange={setMetaAppSecret}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={verifyMeta}
            disabled={verifying}
            className="px-4 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 text-sm font-medium hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {verifying ? "جاري التحقق…" : "🔌 تحقّق من الاتصال"}
          </button>
          {metaStatus && <StatusPill raw={metaStatus} />}
        </div>
      </div>

      {/* AI card */}
      <div className="card p-5 space-y-3">
        <h2 className="section-title flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-300" /> مزوّدو الذكاء الاصطناعي
        </h2>
        <div>
          <label className="text-xs text-slate-400 block mb-1">
            المزوّد الافتراضي (يستخدمه العقل المعرفي تلقائياً)
          </label>
          <select
            value={defaultAiProvider}
            onChange={(e) => setDefaultAiProvider(e.target.value)}
            className="input px-3 py-2 text-sm max-w-xs"
          >
            <option value="">— KEYONE الافتراضي —</option>
            <option value="openai">OpenAI</option>
            <option value="claude">Claude</option>
            <option value="gemini">Gemini</option>
          </select>
        </div>
        <AiRow
          label="OpenAI"
          provider="openai"
          mask={data.ai.openai}
          value={openaiKey}
          onChange={setOpenaiKey}
          onTest={() => testAi("openai")}
          testing={testing === "openai"}
          status={aiStatus.openai}
        />
        <AiRow
          label="Claude"
          provider="claude"
          mask={data.ai.claude}
          value={claudeKey}
          onChange={setClaudeKey}
          onTest={() => testAi("claude")}
          testing={testing === "claude"}
          status={aiStatus.claude}
        />
        <AiRow
          label="Gemini"
          provider="gemini"
          mask={data.ai.gemini}
          value={geminiKey}
          onChange={setGeminiKey}
          onTest={() => testAi("gemini")}
          testing={testing === "gemini"}
          status={aiStatus.gemini}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold disabled:opacity-50 inline-flex items-center gap-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />} حفظ
          التكاملات
        </button>
        {msg && (
          <span
            className={msg.kind === "ok" ? "text-emerald-300 text-sm" : "text-rose-300 text-sm"}
          >
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

function StatusPill({ raw }: { raw: string }) {
  const ok = raw.startsWith("connected");
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm ${ok ? "text-emerald-300" : "text-rose-300"}`}
    >
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {ok
        ? "متصل"
        : raw.startsWith("token_invalid")
          ? "رمز غير صالح"
          : raw.startsWith("not_configured")
            ? "غير مكتمل"
            : "غير متصل"}
    </span>
  );
}

function AiRow({
  label,
  provider,
  mask,
  value,
  onChange,
  onTest,
  testing,
  status,
}: {
  label: string;
  provider: string;
  mask: MaskedSecret;
  value: string;
  onChange: (v: string) => void;
  onTest: () => void;
  testing: boolean;
  status?: string;
}) {
  void provider;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex-1 min-w-[220px]">
        <label className="text-xs text-slate-400 block mb-1">
          {label} {mask.hasValue && <span className="text-emerald-300">• محفوظ ({mask.mask})</span>}
        </label>
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={mask.hasValue ? "اتركه فارغاً للإبقاء" : "أدخل المفتاح"}
          className="input px-3 py-2 text-sm"
        />
      </div>
      <button
        onClick={onTest}
        disabled={testing}
        className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm disabled:opacity-50"
      >
        {testing ? "..." : "اختبار"}
      </button>
      {status && (
        <span
          className={`text-xs ${status === "connected" ? "text-emerald-300" : "text-rose-300"}`}
        >
          {status === "connected" ? "✓ متصل" : "✗ فشل"}
        </span>
      )}
    </div>
  );
}

function F({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir="ltr"
        className="input px-3 py-2 text-sm"
      />
    </div>
  );
}

function S({
  label,
  mask,
  value,
  onChange,
}: {
  label: string;
  mask: MaskedSecret;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1">
        {label} {mask.hasValue && <span className="text-emerald-300">• محفوظ ({mask.mask})</span>}
      </label>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir="ltr"
        placeholder={mask.hasValue ? "اتركه فارغاً للإبقاء" : ""}
        className="input px-3 py-2 text-sm"
      />
    </div>
  );
}
