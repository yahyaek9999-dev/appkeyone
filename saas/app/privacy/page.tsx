import Link from "next/link";
import { getSiteConfig } from "@/lib/admin";
import PublicNav from "@/components/ui/public-nav";

export const metadata = {
  title: "سياسة الخصوصية",
  description: "كيف نحمي بياناتك وبيانات عملائك.",
};

export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const cfg = await getSiteConfig();

  return (
    <main className="ai-page">
      <PublicNav brandName={cfg.brandName} supportWhatsapp={cfg.supportWhatsapp} current="legal" />

      <section className="px-4 pb-16 pt-32 sm:pt-36">
        <article className="ai-card prose prose-invert prose-headings:text-white prose-p:text-slate-300 prose-li:text-slate-300 prose-strong:text-white mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <h1>سياسة الخصوصية</h1>
        <p className="text-sm text-slate-400">آخر تحديث: {new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</p>

        <h2>1. مقدمة</h2>
        <p>
          نحن في <strong>{cfg.brandName}</strong> نأخذ خصوصيتك على محمل الجد. هذه السياسة توضح أي بيانات نجمعها، ولماذا، وكيف نحميها.
        </p>

        <h2>2. البيانات التي نجمعها</h2>
        <h3>بيانات حسابك:</h3>
        <ul>
          <li>الاسم، البريد الإلكتروني، رقم الهاتف.</li>
          <li>تاريخ التسجيل، تاريخ آخر دخول.</li>
          <li>تفاصيل اشتراكك الحالي.</li>
        </ul>
        <h3>بيانات عملاء نشاطك:</h3>
        <ul>
          <li>أرقام واتساب العملاء.</li>
          <li>محتوى المحادثات (لتمكين الذاكرة والسياق).</li>
          <li>سجل الطلبات والتنبيهات.</li>
        </ul>
        <h3>بيانات تقنية:</h3>
        <ul>
          <li>عنوان IP، نوع المتصفح، الجهاز.</li>
          <li>سجلات الدخول وأخطاء النظام.</li>
        </ul>

        <h2>3. كيف نستخدم البيانات</h2>
        <ul>
          <li>تشغيل المساعد الذكي والرد على عملائك.</li>
          <li>تتبع الاستهلاك وفوترة الباقات.</li>
          <li>تحسين دقة الردود وتجربة الاستخدام.</li>
          <li>إرسال إشعارات هامة (تجديد، انتهاء، تنبيهات أمنية).</li>
          <li>الامتثال للقوانين والمتطلبات الرسمية.</li>
        </ul>

        <h2>4. مشاركة البيانات</h2>
        <p>
          <strong>نحن لا نبيع بياناتك أو بيانات عملائك أبداً</strong>. نشارك حصراً مع:
        </p>
        <ul>
          <li>مزود الذكاء الاصطناعي (OpenAI / Anthropic) — فقط لمعالجة الطلب الفوري دون تخزين.</li>
          <li>مزودي البنية التحتية (الخادم، النسخ الاحتياطي) ضمن اتفاقيات سرية صارمة.</li>
          <li>الجهات القانونية فقط عند صدور أمر قضائي مُلزم.</li>
        </ul>

        <h2>5. تخزين البيانات والاحتفاظ بها</h2>
        <ul>
          <li>البيانات تُخزَّن على خوادم محمية بالتشفير.</li>
          <li>كلمات السر مُشفّرة باستخدام bcrypt.</li>
          <li>محادثات العملاء تُحفظ ما دام اشتراكك نشطاً.</li>
          <li>عند إلغاء الاشتراك، يتم حذف البيانات نهائياً خلال 30 يوماً.</li>
        </ul>

        <h2>6. حقوقك</h2>
        <p>كمستخدم، لك الحق في:</p>
        <ul>
          <li><strong>الوصول</strong> لكل بياناتك المُخزَّنة.</li>
          <li><strong>التصدير</strong> بصيغة JSON / CSV.</li>
          <li><strong>التصحيح</strong> لأي بيانات غير دقيقة.</li>
          <li><strong>الحذف الكامل</strong> ("الحق في النسيان") عبر طلب رسمي.</li>
          <li><strong>تقييد المعالجة</strong> لبيانات محددة.</li>
        </ul>
        <p>لممارسة أي من هذه الحقوق، تواصل: <a href={`mailto:${cfg.supportEmail}`}>{cfg.supportEmail}</a></p>

        <h2>7. ملفات تعريف الارتباط (Cookies)</h2>
        <p>
          نستخدم cookies ضرورية فقط للجلسة (تسجيل الدخول). لا نستخدم cookies تتبع إعلاني من طرف ثالث.
        </p>

        <h2>8. أمان البيانات</h2>
        <ul>
          <li>كل الاتصالات مُشفّرة عبر HTTPS/TLS 1.3.</li>
          <li>كلمات السر hash مع bcrypt.</li>
          <li>الجلسات تستخدم JWT موقّع.</li>
          <li>نسخ احتياطي يومي.</li>
          <li>سجلات تدقيق لكل الوصولات الإدارية.</li>
        </ul>

        <h2>9. مسؤوليتك كمشترك</h2>
        <p>
          أنت مسؤول عن إبلاغ عملائك بأن المحادثات مع البوت تُحفظ، وعن الحصول على موافقتهم عند الحاجة.
        </p>

        <h2>10. تعديلات على هذه السياسة</h2>
        <p>
          نحدّث هذه السياسة كلما لزم. التغييرات الجوهرية تُبلغ لك عبر البريد قبل 30 يوماً.
        </p>

        <h2>11. التواصل</h2>
        <p>
          أسئلة عن الخصوصية: <a href={`mailto:${cfg.supportEmail}`}>{cfg.supportEmail}</a>
        </p>
        </article>
      </section>

      <footer className="border-t border-brand-500/10 py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} {cfg.brandName}.
        <Link href="/terms" className="hover:text-slate-300 mr-3">شروط الخدمة</Link>
      </footer>
    </main>
  );
}
