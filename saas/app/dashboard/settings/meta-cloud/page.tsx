import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { decryptSecret, maskSecret } from "@/lib/crypto-util";
import { normalizeConnectionMode } from "@/lib/messaging/mode";
import { getEffectivePlan } from "@/lib/membership/plan";
import { bridgeEnabled } from "@/lib/bridge/flags";
import { MetaCloudForm } from "./meta-cloud-form";

export const dynamic = "force-dynamic";

function maskEnc(enc: string | null | undefined): { mask: string; hasValue: boolean } {
  if (!enc) return { mask: "", hasValue: false };
  try { const raw = decryptSecret(enc); return { mask: maskSecret(raw), hasValue: raw.length > 0 }; }
  catch { return { mask: "•••• (يرجى إعادة الإدخال)", hasValue: true }; }
}

export default async function MetaCloudPage() {
  const { user } = await requirePagePermission("settings");
  const bot = await prisma.bot.findUnique({ where: { userId: user.id } }) as any;
  if (!bot) redirect("/dashboard");

  const plan = await getEffectivePlan(user.id);
  const mode = normalizeConnectionMode(bot.connectionMode);

  // Eligibility is driven purely by the merchant's plan tier:
  //   Max / Companies → Meta Cloud available.  Starter / Pro → QR only.
  const planAccess = plan.metaAccess; // "none" | "limited" | "full"
  const metaAvailable = planAccess !== "none";

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
    planAccess,
    bridgeEnabled: bridgeEnabled(),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">واتساب — وضع الاتصال</h1>
        <p className="text-slate-400">
          اختر طريقة الاتصال بواتساب: <b className="text-emerald-300">QR Code</b> (السلوك الحالي، شغّال للجميع)
          أو <b className="text-brand-300">Meta Cloud API</b> (الربط الرسمي عبر Meta Business).
        </p>
      </div>

      {metaAvailable ? (
        <div className="card p-4 bg-emerald-500/10 border-emerald-500/30 text-sm text-slate-200">
          <b className="text-emerald-300">يمكنك الآن ربط Meta Cloud API.</b> أكمل إعدادات Meta Business للبدء.
        </div>
      ) : (
        <div className="card p-4 bg-amber-500/10 border-amber-500/30 text-sm text-slate-200">
          <b className="text-amber-300">Meta Cloud API متاحة ضمن باقات Max و Companies.</b>{" "}
          يمكنك الاستمرار باستخدام QR Code أو الترقية لتفعيل Meta Cloud.
          <div className="mt-2">
            <a className="text-brand-300 underline" href="/pricing">عرض الباقات والترقية ←</a>
          </div>
        </div>
      )}

      <div className="card p-6 max-w-3xl">
        <MetaCloudForm initial={initial} />
      </div>

      {metaAvailable && (
        <div className="card p-6 max-w-3xl text-sm text-slate-300 space-y-2">
          <h3 className="font-bold text-slate-100 mb-2">خطوات الربط</h3>
          <p>1. اذهب إلى <a className="text-brand-300 underline" href="https://business.facebook.com" target="_blank" rel="noreferrer">Meta Business Manager</a> وأنشئ تطبيق WhatsApp Business.</p>
          <p>2. من إعدادات التطبيق، انسخ <b>معرّف رقم الهاتف</b> و<b>معرّف حساب الأعمال</b> وأدخلهما في الحقول أعلاه.</p>
          <p>3. أنشئ رمز وصول دائم (System User Token) من لوحة Meta وألصقه في خانة <b>رمز الوصول</b>.</p>
          <p>4. انسخ <b>سر التطبيق</b> من إعدادات Meta وألصقه — ضروري لتأمين الاتصال.</p>
          <p>5. اكتب كلمة مرور سرية في خانة <b>رمز التحقق</b> واستخدم نفس الكلمة عند إعداد الـ Webhook في Meta.</p>
          <p>6. عيّن رابط الـ Webhook في Meta على الرابط التالي: <span className="font-mono text-brand-300 text-xs">https://wkeyone.app/api/whatsapp/meta-webhook</span></p>
          <p className="text-slate-400 pt-2 border-t border-white/10">🔒 جميع المفاتيح والرموز محفوظة بتشفير كامل ولا تُعرض مجدداً بعد الحفظ.</p>
        </div>
      )}
    </div>
  );
}
