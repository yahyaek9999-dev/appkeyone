import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { decryptSecret, maskSecret } from "@/lib/crypto-util";
import { normalizeConnectionMode } from "@/lib/messaging/mode";
import { metaCloudAllowedForUser, metaCloudGloballyEnabled } from "@/lib/messaging/feature-flags";
import { MetaCloudForm } from "./meta-cloud-form";

export const dynamic = "force-dynamic";

function maskEnc(enc: string | null | undefined): { mask: string; hasValue: boolean } {
  if (!enc) return { mask: "", hasValue: false };
  try { const raw = decryptSecret(enc); return { mask: maskSecret(raw), hasValue: raw.length > 0 }; }
  catch { return { mask: "•••• (غير قابل للقراءة — أعد الإدخال)", hasValue: true }; }
}

export default async function MetaCloudPage() {
  const user = await requireUser();
  const bot = await prisma.bot.findUnique({ where: { userId: user.id } }) as any;
  if (!bot) redirect("/dashboard");

  const eligibility = await metaCloudAllowedForUser(user.id);
  const mode = normalizeConnectionMode(bot.connectionMode);

  const initial = {
    mode,
    phoneNumberId: bot.metaPhoneNumberId || "",
    businessAccountId: bot.metaBusinessAccountId || "",
    webhookVerifyToken: bot.metaWebhookVerifyToken || "",
    accessToken: maskEnc(bot.metaAccessTokenEnc),
    appSecret:   maskEnc(bot.metaAppSecretEnc),
    qualityRating: bot.metaQualityRating || null,
    messagingLimit: bot.metaMessagingLimit || null,
    verifiedAt: bot.metaVerifiedAt ? new Date(bot.metaVerifiedAt).toISOString() : null,
    globalEnabled: metaCloudGloballyEnabled(),
    planAccess: eligibility.access,
    eligibilityReason: eligibility.reason,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold mb-2">واتساب — وضع الاتصال</h1>
        <p className="text-slate-400">
          اختر طريقة الاتصال بواتساب: <b className="text-emerald-300">QR Code</b> (السلوك الحالي، شغّال للجميع)
          أو <b className="text-brand-300">Meta Cloud API</b> (الرسمي، يحتاج موافقة Meta واشتراك متقدم).
        </p>
      </div>

      {!initial.globalEnabled && (
        <div className="card p-4 bg-amber-500/10 border-amber-500/30 text-sm text-slate-200">
          <b className="text-amber-300">ملاحظة:</b> وضع Meta Cloud معطّل حالياً على المنصة (`META_CLOUD_ENABLED=0`). تقدر تحفظ بياناتك،
          لكن الرسائل هتفضل تتبعت عبر QR لحد ما المدير يفعّل الوضع.
        </div>
      )}

      {initial.planAccess === "none" && (
        <div className="card p-4 bg-rose-500/10 border-rose-500/30 text-sm text-slate-200">
          <b className="text-rose-300">باقتك الحالية لا تدعم Meta Cloud.</b> يحتاج اشتراك في باقة <b>Max</b> أو <b>Companies</b>.
        </div>
      )}

      <div className="card p-6 max-w-3xl">
        <MetaCloudForm initial={initial} />
      </div>

      <div className="card p-6 max-w-3xl text-sm text-slate-300 space-y-2">
        <h3 className="font-bold text-slate-100 mb-2">إعداد سريع</h3>
        <p>1. أنشئ Meta Business Account و WhatsApp Business App على <a className="text-brand-300 underline" href="https://developers.facebook.com" target="_blank" rel="noreferrer">developers.facebook.com</a>.</p>
        <p>2. خد <b>Phone Number ID</b> و <b>WhatsApp Business Account ID</b> من لوحة Meta وأدخلهم هنا.</p>
        <p>3. أنشئ <b>System User Access Token</b> طويل المدة (≥ 60 يوم) وألصقه في خانة "Access Token".</p>
        <p>4. خد <b>App Secret</b> من إعدادات التطبيق وألصقه — مطلوب لتوقيع الـ webhooks.</p>
        <p>5. اختر <b>Webhook Verify Token</b> (أي نص عشوائي قوي) واستخدمه في إعدادات webhook في Meta.</p>
        <p>6. ضبط webhook URL في Meta على: <code className="text-brand-300">{`https://<your-domain>/api/whatsapp/meta-webhook`}</code></p>
        <p>7. اشترك في الـ fields: <code>messages</code>, <code>message_template_status_update</code>, <code>account_alerts</code>.</p>
        <p className="text-slate-400 pt-2 border-t border-white/10">⚙️ كل المفاتيح بتتخزّن بتشفير AES-256-GCM، ومش بتظهر تاني بعد الحفظ.</p>
      </div>
    </div>
  );
}
