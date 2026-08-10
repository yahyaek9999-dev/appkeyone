import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { decryptSecret, maskSecret } from "@/lib/crypto-util";
import { DEFAULT_MODELS, PROVIDER_LABELS, type ProviderId } from "@/lib/providers/types";
import { AIProviderForm } from "./ai-provider-form";

export const dynamic = "force-dynamic";

export default async function AIProviderPage() {
  const { user } = await requirePagePermission("settings");
  const bot = await prisma.bot.findUnique({ where: { userId: user.id } });
  if (!bot) redirect("/dashboard");

  const provider = ((bot as any).aiProvider || "keyone") as ProviderId;
  const enc = (bot as any).aiApiKeyEnc as string | null | undefined;
  const model = ((bot as any).aiModel as string | null | undefined) || "";

  let keyMask = "";
  let hasKey = false;
  if (enc) {
    try {
      const raw = decryptSecret(enc);
      hasKey = raw.length > 0;
      keyMask = maskSecret(raw);
    } catch {
      hasKey = true;
      keyMask = "•••• (غير قابل للقراءة — أعد الإدخال)";
    }
  }

  const initial = {
    provider,
    model,
    hasKey,
    keyMask,
    defaultModel: provider === "keyone" ? "" : (DEFAULT_MODELS as any)[provider] || "",
    providers: (Object.entries(PROVIDER_LABELS) as [ProviderId, string][]).map(([id, label]) => ({ id, label })),
  };

  return (
    <div>
      <h1 className="page-title mb-1">مزوّد الخدمة</h1>
      <p className="page-desc mb-8">
        اختر مزوّد الذكاء الاصطناعي اللي بوتك يستخدمه. لو متاركتش الإعدادات هتشتغل
        بـ <span className="font-bold text-brand-300">KEYONE AI</span> الافتراضي.
      </p>

      <div className="card p-6 max-w-2xl">
        <AIProviderForm initial={initial} />
      </div>

      <div className="card p-6 max-w-2xl mt-6 text-sm text-slate-300 space-y-2">
        <h3 className="font-bold text-slate-100 mb-2">معلومات سريعة</h3>
        <p>• المفتاح بيتشفر بالكامل قبل التخزين، ومش بيظهر في الواجهة بعد الحفظ.</p>
        <p>• الـ KEYONE AI الافتراضي هيفضل يشتغل لو حصل أي خلل في مزوّدك.</p>
        <p>• كل طبقات الذكاء (الواقعية البشرية، منع الحظر، الذاكرة، المبيعات، الـ cache) شغّالة زي ما هي مع أي مزوّد.</p>
        <p>• زرار "اختبار الاتصال" بيبعت رسالة صغيرة جداً (≤ 5 توكنز) للتأكد إن المفتاح شغّال.</p>
      </div>
    </div>
  );
}
