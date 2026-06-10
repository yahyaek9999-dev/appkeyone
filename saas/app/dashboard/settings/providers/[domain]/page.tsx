import { requirePagePermission } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { SLUG_TO_DOMAIN, DOMAIN_LABELS, DOMAIN_SLUGS } from "@/lib/integrations/registry";
import type { ProviderDomain } from "@/lib/integrations/types";
import { ProvidersClient } from "./providers-client";

export const dynamic = "force-dynamic";

const INTRO: Record<ProviderDomain, { title: string; desc: string; steps: string[] }> = {
  ai: {
    title: "مزوّدو الذكاء الاصطناعي",
    desc: "اربط مفاتيحك الخاصة (OpenAI، Claude، Gemini، Groq، OpenRouter، Grok، أو Endpoint مخصّص). رتّب الأولوية ليتم التبديل التلقائي عند تعطّل مزوّد.",
    steps: ["أنشئ مفتاح API من لوحة المزوّد.", "ألصقه هنا ثم اضغط اختبار الاتصال.", "رتّب المزوّدين — الأعلى يُجرَّب أولاً، والباقي احتياطي تلقائي."],
  },
  speech: {
    title: "تحويل الصوت إلى نص",
    desc: "فعّل تفريغ الرسائل الصوتية بالعربية ولغات أخرى عبر Whisper أو Groq أو Deepgram أو AssemblyAI أو خدمة مخصّصة.",
    steps: ["اختر مزوّدك وألصق المفتاح.", "اختبر الاتصال.", "تُحوَّل الرسائل الصوتية تلقائياً إلى نص ثم رد ذكي."],
  },
  image: {
    title: "الذكاء الاصطناعي للصور",
    desc: "ولّد وحلّل الصور (إيصالات، منتجات، تسويق) عبر OpenAI أو Gemini أو Claude أو Replicate أو Stability أو خدمة مخصّصة.",
    steps: ["اختر مزوّداً يدعم التوليد و/أو التحليل.", "ألصق المفتاح واختبر.", "ابدأ بتوليد أو تحليل الصور من القنوات."],
  },
  sms: {
    title: "مزوّدو الرسائل النصية SMS",
    desc: "أرسل رسائل SMS عبر Twilio أو Vonage أو MessageBird أو Plivo أو Infobip أو بوابة مخصّصة، مع تتبّع التسليم وإعادة المحاولة.",
    steps: ["أدخل بيانات المزوّد ورقم/معرّف المرسِل.", "اختبر الاتصال.", "استخدمها في الإشعارات الشرطية والتنبيهات."],
  },
  email: {
    title: "مزوّدو البريد الإلكتروني",
    desc: "أرسل رسائل التحقق وإعادة التعيين والإشعارات والحملات عبر SMTP أو SendGrid أو Mailgun أو SES أو Postmark أو Resend/Brevo، مع تبديل احتياطي.",
    steps: ["اختر مزوّدك وأدخل المفتاح والبريد المرسِل.", "اختبر الاتصال.", "رتّب الأولوية للتبديل الاحتياطي عند الفشل."],
  },
};

export default async function ProviderDomainPage(props: { params: Promise<{ domain: string }> }) {
  const params = await props.params;
  await requirePagePermission("settings");
  const domain = (SLUG_TO_DOMAIN[params.domain] || null) as ProviderDomain | null;
  if (!domain) notFound();
  // Canonicalize to the preferred slug (e.g. /providers/speech → /providers/voice).
  if (params.domain !== DOMAIN_SLUGS[domain]) redirect(`/dashboard/settings/providers/${DOMAIN_SLUGS[domain]}`);

  const intro = INTRO[domain];

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <div className="text-xs text-slate-500 mb-1">الإعدادات / المزوّدون</div>
        <h1 className="page-title">{intro.title}</h1>
        <p className="page-desc mt-1">{intro.desc}</p>
      </div>

      <ProvidersClient slug={DOMAIN_SLUGS[domain]} />

      <div className="card p-5 text-sm text-slate-300 space-y-2">
        <h3 className="font-semibold text-slate-100 mb-1">خطوات الربط</h3>
        <ol className="list-decimal ms-5 space-y-1 text-slate-400">
          {intro.steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
        <p className="text-xs text-slate-500 pt-1">🔒 كل المفاتيح تُخزَّن مشفّرة (AES-256-GCM) ولا تظهر أبداً بعد الحفظ. لكل حساب إعداداته المعزولة بالكامل.</p>
      </div>
    </div>
  );
}
