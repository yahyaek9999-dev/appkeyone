import Link from "next/link";
import { getSiteConfig } from "@/lib/admin";
import PublicNav from "@/components/ui/public-nav";

export const metadata = {
  title: "شروط الخدمة",
  description: "الشروط القانونية لاستخدام منصة الذكاء الاصطناعي.",
};

export const dynamic = "force-dynamic";

export default async function TermsPage() {
  const cfg = await getSiteConfig();

  return (
    <main className="ai-page">
      <PublicNav brandName={cfg.brandName} supportWhatsapp={cfg.supportWhatsapp} current="legal" />

      <section className="px-4 pb-16 pt-32 sm:pt-36">
        <article className="ai-card prose prose-invert prose-headings:text-white prose-p:text-slate-300 prose-li:text-slate-300 prose-strong:text-white mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <h1>شروط الخدمة</h1>
        <p className="text-sm text-slate-400">آخر تحديث: {new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</p>

        <h2>1. القبول</h2>
        <p>
          باستخدامك منصة <strong>{cfg.brandName}</strong> ("الخدمة") فإنك توافق على هذه الشروط. إذا لم توافق، لا تستخدم الخدمة.
        </p>

        <h2>2. وصف الخدمة</h2>
        <p>
          {cfg.brandName} توفر منصة ذكاء اصطناعي لإدارة المحادثات الآلية مع عملاء المشترك عبر واتساب وقنوات أخرى. يشمل ذلك:
        </p>
        <ul>
          <li>ربط حساب واتساب التجاري بمساعد ذكي.</li>
          <li>تخزين سجل المحادثات لتحسين الردود.</li>
          <li>تنبيهات الطلبات والمبيعات.</li>
          <li>إدارة قاعدة المعرفة الخاصة بنشاطك.</li>
        </ul>

        <h2>3. الاشتراك والدفع</h2>
        <ul>
          <li>الاشتراك شهري أو سنوي بحسب الباقة المختارة.</li>
          <li>الدفع يتم مسبقاً عبر التحويل البنكي، فودافون كاش، إنستاباي، أو فيزا.</li>
          <li>التفعيل يتم خلال 24 ساعة من تأكيد الدفع.</li>
          <li>الأسعار قابلة للتعديل بإشعار 30 يوماً مسبقاً للمشتركين الحاليين.</li>
        </ul>

        <h2>4. الاستخدام المسموح</h2>
        <p>تتعهد بعدم استخدام الخدمة لأي مما يلي:</p>
        <ul>
          <li>إرسال رسائل غير مرغوب فيها (Spam).</li>
          <li>محتوى احتيالي، عنصري، أو ينتهك القانون.</li>
          <li>محاولة اختراق أو إعاقة الخدمة.</li>
          <li>إعادة بيع الخدمة بدون اتفاق رسمي.</li>
        </ul>
        <p>
          نحتفظ بحق إيقاف أي حساب يخالف هذه السياسة فوراً.
        </p>

        <h2>5. حدود الاستخدام</h2>
        <p>
          كل باقة تحدد عدد رسائل شهرياً. عند الوصول للحد، تتوقف الخدمة تلقائياً حتى ترقية الباقة أو بداية الشهر التالي. يمكن شراء رسائل إضافية بسعر $0.02 للرسالة الواحدة.
        </p>

        <h2>6. الملكية الفكرية</h2>
        <p>
          البرمجيات والشعارات والمحتوى التقني ملك حصري لـ {cfg.brandName}. أنت تحتفظ بملكية كاملة لبياناتك ومحادثاتك وقاعدة معرفتك.
        </p>

        <h2>7. حدود المسؤولية</h2>
        <p>
          الخدمة تُقدَّم "كما هي". لا نضمن دقة 100% لردود الذكاء الاصطناعي. مسؤوليتنا الأقصى تجاهك محدودة بقيمة آخر شهر دفعته.
        </p>

        <h2>8. إنهاء الخدمة</h2>
        <p>
          يحق لأي طرف إنهاء الاتفاقية بإشعار 30 يوماً. عند الإنهاء، نوفر لك بياناتك بصيغة قابلة للتصدير لمدة 30 يوماً، ثم تُحذف نهائياً.
        </p>

        <h2>9. القانون الحاكم</h2>
        <p>
          تخضع هذه الشروط لقوانين جمهورية مصر العربية. أي نزاع يحل ودياً أولاً، ثم عبر التحكيم في القاهرة.
        </p>

        <h2>10. التواصل</h2>
        <p>
          للاستفسارات: <a href={`mailto:${cfg.supportEmail}`}>{cfg.supportEmail}</a> أو واتساب <a href={`https://wa.me/${cfg.supportWhatsapp.replace(/[^\d]/g,"")}`} dir="ltr">{cfg.supportWhatsapp}</a>
        </p>
        </article>
      </section>

      <footer className="border-t border-brand-500/10 py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} {cfg.brandName}.
        <Link href="/privacy" className="hover:text-slate-300 mr-3">سياسة الخصوصية</Link>
      </footer>
    </main>
  );
}
