"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, Sparkles, FlaskConical, Zap, Brain, Rocket } from "lucide-react";

type ProviderId = "keyone" | "openai" | "gemini" | "openrouter" | "claude" | "groq";
type QualityTier = "fast" | "balanced" | "smart";

const TIER_MODELS: Record<Exclude<ProviderId, "keyone">, Record<QualityTier, string>> = {
  openai:     { fast: "gpt-4o-mini",                             balanced: "gpt-4o",                       smart: "gpt-4.1" },
  claude:     { fast: "claude-3-5-haiku-latest",                 balanced: "claude-3-5-sonnet-20241022",   smart: "claude-opus-4-5" },
  gemini:     { fast: "gemini-2.0-flash",                        balanced: "gemini-1.5-pro",               smart: "gemini-1.5-pro" },
  openrouter: { fast: "meta-llama/llama-3.3-70b-instruct:free", balanced: "openai/gpt-4o",               smart: "anthropic/claude-opus-4" },
  groq:       { fast: "llama-3.1-8b-instant",                    balanced: "llama-3.3-70b-versatile",     smart: "llama-3.3-70b-versatile" },
};

const TIERS: { id: QualityTier; ar: string; desc: string; Icon: React.ElementType }[] = [
  { id: "fast",     ar: "سريع",   desc: "ردود فورية، تكلفة منخفضة",     Icon: Zap },
  { id: "balanced", ar: "متوازن", desc: "دقة أعلى، مناسب للمبيعات",     Icon: Brain },
  { id: "smart",    ar: "ذكي",   desc: "أعلى دقة، أبطأ قليلاً",        Icon: Rocket },
];

type Initial = {
  provider: ProviderId;
  model: string;
  hasKey: boolean;
  keyMask: string;
  defaultModel: string;
  providers: { id: ProviderId; label: string }[];
};

type Status =
  | { kind: "idle" }
  | { kind: "info"; msg: string }
  | { kind: "ok"; msg: string }
  | { kind: "err"; msg: string };

export function AIProviderForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [provider, setProvider] = useState<ProviderId>(initial.provider);
  const [model, setModel] = useState(initial.model);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();
  const [testing, setTesting] = useState(false);

  const isKeyone = provider === "keyone";
  const defaultModel =
    provider === "openai"     ? "gpt-4o-mini" :
    provider === "gemini"     ? "gemini-2.0-flash" :
    provider === "openrouter" ? "meta-llama/llama-3.3-70b-instruct:free" :
    provider === "claude"     ? "claude-3-5-haiku-latest" :
    provider === "groq"       ? "llama-3.1-8b-instant" : "";

  // Detect which tier the current model corresponds to (if any)
  function activeTier(): QualityTier | null {
    if (isKeyone) return null;
    const tiers = TIER_MODELS[provider as Exclude<ProviderId, "keyone">];
    if (!tiers) return null;
    const m = model || defaultModel;
    for (const t of ["fast", "balanced", "smart"] as QualityTier[]) {
      if (tiers[t] === m) return t;
    }
    return null;
  }

  function selectTier(tier: QualityTier) {
    if (isKeyone) return;
    const tiers = TIER_MODELS[provider as Exclude<ProviderId, "keyone">];
    if (tiers) setModel(tiers[tier]);
  }

  async function onTest() {
    if (isKeyone) return;
    setTesting(true);
    setStatus({ kind: "info", msg: "جاري اختبار الاتصال..." });
    try {
      const r = await fetch("/api/settings/ai-provider/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: apiKey || undefined,
          model: model || undefined,
        }),
      });
      const j = await r.json();
      if (r.ok && j.ok) {
        setStatus({ kind: "ok", msg: `الاتصال ناجح ✅  (الرد: "${j.preview || "—"}")` });
      } else {
        setStatus({ kind: "err", msg: j.error || `فشل الاختبار (${r.status})` });
      }
    } catch (e: any) {
      setStatus({ kind: "err", msg: e?.message || "خطأ في الشبكة" });
    } finally {
      setTesting(false);
    }
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "info", msg: "جاري الحفظ..." });
    startTransition(async () => {
      try {
        const r = await fetch("/api/settings/ai-provider", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            apiKey: apiKey || undefined,
            model: model || undefined,
          }),
        });
        const j = await r.json();
        if (r.ok) {
          setStatus({ kind: "ok", msg: "تم الحفظ ✅" });
          setApiKey(""); // clear key from UI memory
          router.refresh();
        } else {
          setStatus({ kind: "err", msg: j.error || `فشل الحفظ (${r.status})` });
        }
      } catch (e: any) {
        setStatus({ kind: "err", msg: e?.message || "خطأ في الشبكة" });
      }
    });
  }

  return (
    <form onSubmit={onSave} className="space-y-5">
      {/* Provider selector */}
      <div>
        <label className="text-sm font-semibold mb-2 block">المزوّد</label>
        <select
          value={provider}
          onChange={(e) => { setProvider(e.target.value as ProviderId); setStatus({ kind: "idle" }); }}
          className="input w-full"
        >
          {initial.providers.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        {isKeyone && (
          <p className="text-xs text-slate-400 mt-2">
            <Sparkles className="inline w-3 h-3 me-1 text-brand-300" />
            KEYONE AI هو المزوّد الافتراضي. مفيش إعدادات إضافية.
          </p>
        )}
      </div>

      {!isKeyone && (
        <>
          {/* API key */}
          <div>
            <label className="text-sm font-semibold mb-2 block">مفتاح الـ API</label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={initial.hasKey ? initial.keyMask : "ألصق مفتاحك هنا"}
                autoComplete="off"
                spellCheck={false}
                className="input w-full pe-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                aria-label="إظهار/إخفاء"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {initial.hasKey
                ? "اتركه فاضي للإبقاء على المفتاح المحفوظ."
                : "المفتاح بيتشفر بالكامل قبل التخزين."}
            </p>
          </div>

          {/* Quality tier selector */}
          <div>
            <label className="text-sm font-semibold mb-2 block">مستوى الذكاء</label>
            <div className="grid grid-cols-3 gap-2">
              {TIERS.map(({ id, ar, desc, Icon }) => {
                const active = activeTier() === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectTier(id)}
                    className={
                      "flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-center transition-all " +
                      (active
                        ? "border-brand-400 bg-brand-400/10 text-brand-300"
                        : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500 hover:text-slate-200")
                    }
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-semibold">{ar}</span>
                    <span className="text-[10px] leading-tight opacity-70">{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Model (optional override) */}
          <div>
            <label className="text-sm font-semibold mb-2 block">
              الموديل <span className="text-xs text-slate-500 font-normal">(اختياري — اختر مستوى أو اكتب يدوياً)</span>
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={defaultModel}
              className="input w-full font-mono text-sm"
            />
            <p className="text-xs text-slate-400 mt-2">
              لو سيبته فاضي هيستخدم: <span className="font-mono">{defaultModel}</span>
            </p>
          </div>
        </>
      )}

      {/* Status message */}
      {status.kind !== "idle" && (
        <div
          className={
            "rounded-lg px-3 py-2 text-sm flex items-start gap-2 " +
            (status.kind === "ok"
              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
              : status.kind === "err"
              ? "bg-rose-500/10 text-rose-300 border border-rose-500/30"
              : "bg-slate-500/10 text-slate-300 border border-slate-500/30")
          }
        >
          {status.kind === "ok"   && <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
          {status.kind === "err"  && <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          {status.kind === "info" && <Loader2 className="w-4 h-4 mt-0.5 shrink-0 animate-spin" />}
          <span>{status.msg}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary inline-flex items-center gap-2"
        >
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          حفظ
        </button>
        {!isKeyone && (
          <button
            type="button"
            onClick={onTest}
            disabled={testing || isPending}
            className="btn-secondary inline-flex items-center gap-2"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
            اختبار الاتصال
          </button>
        )}
      </div>
    </form>
  );
}
