"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const QUALITY_LABEL: Record<string, string> = {
  GREEN: "ممتازة",
  YELLOW: "متوسطة",
  RED: "ضعيفة",
};

const MESSAGING_LIMIT_LABEL: Record<string, string> = {
  TIER_50: "50 رسالة/يوم",
  TIER_250: "250 رسالة/يوم",
  TIER_1K: "1,000 رسالة/يوم",
  TIER_10K: "10,000 رسالة/يوم",
  TIER_100K: "100,000 رسالة/يوم",
  TIER_UNLIMITED: "غير محدود",
};

interface MaskedSecret { mask: string; hasValue: boolean }
interface InitialState {
  mode: "qr" | "meta_cloud";
  phoneNumberId: string;
  businessAccountId: string;
  webhookVerifyToken: string;
  accessToken: MaskedSecret;
  appSecret: MaskedSecret;
  qualityRating: string | null;
  messagingLimit: string | null;
  verifiedAt: string | null;
  planAccess: "none" | "limited" | "full";
}

export function MetaCloudForm({ initial }: { initial: InitialState }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"qr" | "meta_cloud">(initial.mode);
  const [phoneNumberId, setPhoneNumberId] = useState(initial.phoneNumberId);
  const [businessAccountId, setBusinessAccountId] = useState(initial.businessAccountId);
  const [webhookVerifyToken, setWebhookVerifyToken] = useState(initial.webhookVerifyToken);
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const planBlocked = initial.planAccess === "none";

  function save() {
    setMsg(null);
    start(async () => {
      const r = await fetch("/api/settings/meta-cloud", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          phoneNumberId,
          businessAccountId,
          webhookVerifyToken,
          accessToken: accessToken.trim() || undefined,
          appSecret: appSecret.trim() || undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setMsg({ kind: "ok", text: "تم الحفظ ✓" });
        setAccessToken("");
        setAppSecret("");
        router.refresh();
      } else {
        setMsg({ kind: "err", text: j.error || `فشل الحفظ (${r.status})` });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Mode selector */}
      <div className="space-y-2">
        <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-lg border ${mode === "qr" ? "bg-emerald-500/10 border-emerald-500/30" : "bg-white/5 border-white/10"}`}>
          <input type="radio" name="mode" checked={mode === "qr"} onChange={() => setMode("qr")} className="mt-1 w-4 h-4 accent-emerald-500" />
          <div className="flex-1">
            <div className="text-sm font-bold">📱 ربط برمز QR</div>
            <div className="text-xs text-slate-400 mt-1">الوضع الافتراضي. متاح لجميع الباقات. سريع ولا يحتاج موافقة Meta.</div>
          </div>
        </label>
        <label className={`flex items-start gap-3 p-3 rounded-lg border ${mode === "meta_cloud" ? "bg-brand-500/10 border-brand-500/30" : "bg-white/5 border-white/10"} ${planBlocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
          <input
            type="radio"
            name="mode"
            checked={mode === "meta_cloud"}
            onChange={() => !planBlocked && setMode("meta_cloud")}
            disabled={planBlocked}
            className="mt-1 w-4 h-4 accent-brand-500"
          />
          <div className="flex-1">
            <div className="text-sm font-bold">☁️ Meta Cloud API الرسمي {planBlocked && <span className="text-xs font-normal text-amber-300 mr-1">(متاحة في باقات Max و Companies)</span>}</div>
            <div className="text-xs text-slate-400 mt-1">اتصال مباشر عبر Meta. أكثر استقراراً على المدى الطويل. يتطلب موافقة Meta وقوالب رسائل معتمدة.</div>
          </div>
        </label>
      </div>

      {/* Status panel — only relevant when Meta is active */}
      {mode === "meta_cloud" && initial.verifiedAt && (
        <div className="card p-4 bg-white/5 text-sm space-y-1">
          <div><span className="text-slate-400">آخر تأكيد صحي:</span> <b>{new Date(initial.verifiedAt).toLocaleString("ar-EG")}</b></div>
          {initial.qualityRating && (
            <div><span className="text-slate-400">جودة الرقم (Meta):</span> <b className={initial.qualityRating === "GREEN" ? "text-emerald-300" : initial.qualityRating === "YELLOW" ? "text-amber-300" : "text-rose-300"}>{QUALITY_LABEL[initial.qualityRating] ?? "—"}</b></div>
          )}
          {initial.messagingLimit && (
            <div><span className="text-slate-400">حد المراسلة الحالي:</span> <b>{MESSAGING_LIMIT_LABEL[initial.messagingLimit] ?? initial.messagingLimit}</b></div>
          )}
        </div>
      )}

      {/* Fields */}
      {mode === "meta_cloud" && (
        <div className="space-y-3">
          <Field label="معرّف رقم الهاتف (Phone Number ID)" value={phoneNumberId} onChange={setPhoneNumberId} placeholder="مثال: 1234567890123456" />
          <Field label="معرّف حساب الأعمال (WABA ID)" value={businessAccountId} onChange={setBusinessAccountId} placeholder="مثال: 9876543210123456" />
          <Field label="رمز التحقق للـ Webhook" value={webhookVerifyToken} onChange={setWebhookVerifyToken} placeholder="كلمة سرية من اختيارك" />
          <SecretField label="رمز الوصول (Access Token)" mask={initial.accessToken.mask} hasValue={initial.accessToken.hasValue} value={accessToken} onChange={setAccessToken} placeholder="EAAB..." />
          <SecretField label="سر التطبيق (App Secret)" mask={initial.appSecret.mask} hasValue={initial.appSecret.hasValue} value={appSecret} onChange={setAppSecret} placeholder="مفتاح من 32 حرف" />
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="px-5 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-white font-bold disabled:opacity-50"
        >
          {pending ? "جاري الحفظ..." : "حفظ التغييرات"}
        </button>
        {msg && (
          <span className={msg.kind === "ok" ? "text-emerald-300 text-sm" : "text-rose-300 text-sm"}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
      />
    </div>
  );
}

function SecretField({ label, mask, hasValue, value, onChange, placeholder }: { label: string; mask: string; hasValue: boolean; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1">
        {label} {hasValue && <span className="text-emerald-300">• محفوظ ({mask})</span>}
      </label>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hasValue ? "اتركه فاضي للحفاظ على القيمة الحالية" : placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
      />
    </div>
  );
}
