"use client";
import ProductTour, { type TourStep } from "@/components/ui/product-tour";

/**
 * First-login guided tour for the customer dashboard. Anchors to stable chrome
 * (search, sidebar) plus the core journey nav links (auto-skipped if collapsed).
 * Shown once; "تخطّي" finishes it, "✕" resumes next visit (localStorage).
 */
const STEPS: TourStep[] = [
  { selector: '[data-tour="search"]', title: "ابحث وانتقل بسرعة", body: "اضغط ⌘K (أو هنا) للوصول لأي صفحة أو إجراء في ثوانٍ — بدون البحث في القوائم." },
  { selector: '[data-tour="sidebar"]', title: "كل أقسام منصتك", body: "من هنا تصل إلى العملاء (CRM)، العقل والردود الذكية، الفوترة، الحملات، التقارير، وصحة واتساب — كل ما تحتاجه لإدارة عملك." },
  { selector: 'a[href="/dashboard/whatsapp"]', title: "ابدأ بربط واتساب", body: "الخطوة الأولى: اربط رقم واتساب عبر QR لتبدأ في استقبال الرسائل والرد الآلي." },
  { selector: 'a[href="/dashboard/customers"]', title: "عملاؤك في مكان واحد", body: "كل من يراسلك يُحفظ تلقائيًا هنا مع سجل المحادثة — صنّف وتابع وحوّل المحتملين." },
  { selector: 'a[href="/dashboard/billing"]', title: "الاشتراك والدفع", body: "اختر باقتك، ادفع، وارفع الإيصال — يعتمده الفريق فيُفعّل اشتراكك تلقائيًا." },
  { selector: 'a[href="/docs"]', title: "تعلّم أي شيء", body: "أدلّة خطوة بخطوة لكل ميزة في «مركز المساعدة» — ابدأ من «البداية السريعة»." },
];

export default function DashboardTour() {
  return <ProductTour id="dashboard_v1" steps={STEPS} />;
}
