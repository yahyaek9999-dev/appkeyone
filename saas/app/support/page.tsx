/** /support — PUBLIC customer Help Center (Phase 11). Searchable. No internals exposed. */
import SupportClient from "./support-client";

export const dynamic = "force-dynamic";

const ARTICLES: Array<{ category: string; q: string; a: string }> = [
  { category: "Billing", q: "كيف أدفع للاشتراك؟", a: "اختر باقتك وطريقة الدفع من صفحة الاشتراك، ارفع إيصال الدفع، وسيراجعه فريقنا ويُفعّل باقتك." },
  { category: "Billing", q: "ما طرق الدفع المتاحة؟", a: "Binance, USDT (TRC20), Vodafone Cash, InstaPay, تحويل بنكي, RedotPay, Bybit, Kast, PayPal." },
  { category: "Billing", q: "كم تستغرق الموافقة؟", a: "تتم المراجعة يدويًا من فريق المالية عادةً خلال وقت قصير بعد رفع الإيصال." },
  { category: "Wallet", q: "ما هي المحفظة؟", a: "رصيد مدفوع مسبقًا يُستخدم لتكاليف رسائل واتساب (Meta). يُشحن تلقائيًا بعد اعتماد الدفع." },
  { category: "Wallet", q: "كيف يُستهلك الرصيد؟", a: "يُخصم تلقائيًا حسب تكلفة المحادثة من Meta، ويتوقف الإرسال عند نفاد الرصيد لحمايتك." },
  { category: "QR", q: "كيف أربط واتساب؟", a: "من لوحة التحكم → واتساب، امسح رمز QR لربط جلستك." },
  { category: "QR", q: "لماذا انقطعت الجلسة؟", a: "قد تنتهي صلاحية الجلسة؛ أعد المسح من صفحة واتساب لإعادة الربط." },
  { category: "Brain", q: "ما هو المساعد الذكي؟", a: "يرد على عملائك تلقائيًا بالاعتماد على معرفتك ومنتجاتك، ويفهم اللهجات العربية." },
  { category: "Brain", q: "ما اللغات المدعومة؟", a: "العربية الفصحى واللهجات (مصري/خليجي/شامي/مغاربي) والإنجليزية." },
  { category: "CRM", q: "كيف تُنظَّم بيانات العملاء؟", a: "يُبنى لكل عميل ملف يتضمن المحادثات والطلبات ودرجة الأهلية والاهتمامات." },
  { category: "API", q: "كيف أحصل على مفتاح API؟", a: "من لوحة التحكم → مركز المطوّرين، أنشئ مفتاحًا (متاح في الباقات الأعلى)." },
  { category: "API", q: "ما حدود الاستخدام؟", a: "لكل مفتاح حدّ طلبات/دقيقة؛ عند تجاوزه تُعاد الحالة 429." },
  { category: "Memberships", q: "كيف أرقّي باقتي؟", a: "من صفحة الاشتراك اختر باقة أعلى وادفع؛ تُفعّل بعد الاعتماد." },
];

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold mb-2">مركز المساعدة</h1>
        <p className="text-slate-400">إجابات سريعة حول الفوترة، المحفظة، QR، المساعد الذكي، العملاء، API، والباقات.</p>
      </div>
      <SupportClient articles={ARTICLES} />
    </div>
  );
}
