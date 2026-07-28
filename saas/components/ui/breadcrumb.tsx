"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";

// ── Dashboard label map ────────────────────────────────────────────────────
const DASHBOARD_LABELS: Record<string, { label: string; workspace?: string }> = {
  "/dashboard": { label: "نظرة عامة", workspace: "الرئيسية" },
  "/dashboard/analytics": { label: "التحليلات", workspace: "الرئيسية" },
  "/dashboard/command-center": { label: "مركز القيادة", workspace: "الرئيسية" },
  "/dashboard/orders": { label: "الطلبات", workspace: "المبيعات" },
  "/dashboard/products": { label: "المنتجات", workspace: "المبيعات" },
  "/dashboard/broadcasts": { label: "الإرسال الجماعي", workspace: "المبيعات" },
  "/dashboard/broadcasts-pro": { label: "حملات الرصيد", workspace: "المبيعات" },
  "/dashboard/customers": { label: "العملاء", workspace: "العملاء" },
  "/dashboard/inbox": { label: "صندوق المحادثات", workspace: "العملاء" },
  "/dashboard/leads": { label: "العملاء المحتملون", workspace: "العملاء" },
  "/dashboard/import": { label: "استيراد العملاء", workspace: "العملاء" },
  "/dashboard/bot": { label: "المساعد الذكي", workspace: "ذكاء الأعمال" },
  "/dashboard/knowledge": { label: "المعرفة", workspace: "ذكاء الأعمال" },
  "/dashboard/knowledge-brain": { label: "عقل المعرفة", workspace: "ذكاء الأعمال" },
  "/dashboard/sales-brain": { label: "عقل المبيعات", workspace: "ذكاء الأعمال" },
  "/dashboard/revenue-copilot": { label: "مساعد الإيرادات", workspace: "ذكاء الأعمال" },
  "/dashboard/revenue-forecast": { label: "توقّع الإيرادات", workspace: "ذكاء الأعمال" },
  "/dashboard/business-intelligence": { label: "ذكاء الأعمال", workspace: "ذكاء الأعمال" },
  "/dashboard/intel": { label: "الرصد الذكي", workspace: "ذكاء الأعمال" },
  "/dashboard/suggestions": { label: "الاقتراحات", workspace: "ذكاء الأعمال" },
  "/dashboard/testing-arena": { label: "ساحة الاختبار", workspace: "ذكاء الأعمال" },
  "/dashboard/ai-audit": { label: "تدقيق الذكاء", workspace: "ذكاء الأعمال" },
  "/dashboard/playground": { label: "تجربة المحادثة", workspace: "ذكاء الأعمال" },
  "/dashboard/quick-replies": { label: "الردود السريعة", workspace: "ذكاء الأعمال" },
  "/dashboard/brain": { label: "مركز الدماغ", workspace: "ذكاء الأعمال" },
  "/dashboard/arena": { label: "ساحة الاختبار", workspace: "ذكاء الأعمال" },
  "/dashboard/arena/benchmark": { label: "المعايير", workspace: "ذكاء الأعمال" },
  "/dashboard/arena/competitors": { label: "المنافسون", workspace: "ذكاء الأعمال" },
  "/dashboard/arena/fixes": { label: "الإصلاحات", workspace: "ذكاء الأعمال" },
  "/dashboard/arena/hallucinations": { label: "الهلوسات", workspace: "ذكاء الأعمال" },
  "/dashboard/arena/optimize": { label: "التحسين", workspace: "ذكاء الأعمال" },
  "/dashboard/arena/prompt-benchmark": { label: "اختبار البرومت", workspace: "ذكاء الأعمال" },
  "/dashboard/arena/quality": { label: "الجودة", workspace: "ذكاء الأعمال" },
  "/dashboard/arena/simulate": { label: "المحاكاة", workspace: "ذكاء الأعمال" },
  "/dashboard/funnel": { label: "قمع التحويل", workspace: "النمو" },
  "/dashboard/segments": { label: "الشرائح", workspace: "النمو" },
  "/dashboard/recovery": { label: "استعادة العملاء", workspace: "النمو" },
  "/dashboard/business": { label: "أداء النشاط", workspace: "النمو" },
  "/dashboard/integrations": { label: "التكاملات", workspace: "العمليات" },
  "/dashboard/automations": { label: "الأتمتة", workspace: "العمليات" },
  "/dashboard/flow-builder": { label: "منشئ المسارات", workspace: "العمليات" },
  "/dashboard/branches": { label: "الفروع", workspace: "العمليات" },
  "/dashboard/approvals": { label: "الموافقات", workspace: "العمليات" },
  "/dashboard/whatsapp-health": { label: "صحة واتساب", workspace: "العمليات" },
  "/dashboard/meta-health": { label: "صحة Meta", workspace: "العمليات" },
  "/dashboard/meta": { label: "مركز Meta", workspace: "العمليات" },
  "/dashboard/ai-operations": { label: "عمليات الذكاء", workspace: "العمليات" },
  "/dashboard/qr-queue": { label: "حجز جلسات QR", workspace: "العمليات" },
  "/dashboard/escalations": { label: "التصعيدات", workspace: "العمليات" },
  "/dashboard/safety": { label: "الأمان", workspace: "العمليات" },
  "/dashboard/compliance": { label: "الامتثال والتسليم", workspace: "العمليات" },
  "/dashboard/audit-log": { label: "سجل التدقيق", workspace: "العمليات" },
  "/dashboard/system-health": { label: "صحة النظام", workspace: "العمليات" },
  "/dashboard/monitoring": { label: "الرصد", workspace: "العمليات" },
  "/dashboard/whatsapp": { label: "ربط واتساب", workspace: "العمليات" },
  "/dashboard/coupons": { label: "الكوبونات", workspace: "البيانات" },
  "/dashboard/export": { label: "تصدير البيانات", workspace: "البيانات" },
  "/dashboard/demo": { label: "بيانات تجريبية", workspace: "البيانات" },
  "/dashboard/settings": { label: "الحساب", workspace: "الإعدادات" },
  "/dashboard/settings/business-profile": { label: "نوع النشاط", workspace: "الإعدادات" },
  "/dashboard/settings/ai-provider": { label: "مزوّد الذكاء", workspace: "الإعدادات" },
  "/dashboard/settings/providers": { label: "المزوّدون", workspace: "الإعدادات" },
  "/dashboard/settings/meta-cloud": { label: "وضع الاتصال", workspace: "الإعدادات" },
  "/dashboard/settings/bridge": { label: "KEYONE Bridge", workspace: "الإعدادات" },
  "/dashboard/settings/bridge/download": { label: "تحميل Bridge", workspace: "الإعدادات" },
  "/dashboard/settings/bridge/link": { label: "ربط جهاز", workspace: "الإعدادات" },
  "/dashboard/settings/orders": { label: "إعدادات الطلبات", workspace: "الإعدادات" },
  "/dashboard/settings/team": { label: "الفريق", workspace: "الإعدادات" },
  "/dashboard/working-hours": { label: "ساعات العمل", workspace: "الإعدادات" },
  "/dashboard/white-label": { label: "العلامة البيضاء", workspace: "الإعدادات" },
  "/dashboard/usage": { label: "استخدام الباقة", workspace: "الإعدادات" },
  "/dashboard/plan": { label: "لوحة الباقة", workspace: "الإعدادات" },
  "/dashboard/billing": { label: "الاشتراك والدفع", workspace: "الإعدادات" },
  "/dashboard/wallet": { label: "المحفظة والرصيد", workspace: "الإعدادات" },
  "/dashboard/developer": { label: "مركز المطوّرين", workspace: "الإعدادات" },
  "/dashboard/developer/docs": { label: "التوثيق", workspace: "الإعدادات" },
  "/dashboard/developer/sdk": { label: "SDK", workspace: "الإعدادات" },
};

// ── Admin label map ────────────────────────────────────────────────────────
const ADMIN_LABELS: Record<string, { label: string; section?: string }> = {
  "/admin": { label: "فحص اليوم" },
  "/admin/super-center": { label: "المركز الموحّد" },
  "/admin/payment-reviews": { label: "مراجعة المدفوعات", section: "المالية" },
  "/admin/upgrade-requests": { label: "طلبات الترقية", section: "المالية" },
  "/admin/wallet": { label: "المحفظة وفوترة Meta", section: "المالية" },
  "/admin/payments": { label: "المدفوعات", section: "المالية" },
  "/admin/analytics": { label: "تحليلات الإيرادات", section: "المالية" },
  "/admin/broadcast-credits": { label: "رصيد الحملات", section: "المالية" },
  "/admin/reports": { label: "التقارير التنفيذية", section: "المالية" },
  "/admin/operations-center": { label: "مركز العمليات", section: "العمليات" },
  "/admin/meta": { label: "منصة Meta", section: "العمليات" },
  "/admin/users": { label: "العملاء والاشتراكات", section: "العمليات" },
  "/admin/orders": { label: "إدارة الطلبات", section: "العمليات" },
  "/admin/incidents": { label: "الحوادث", section: "العمليات" },
  "/admin/qr-queue": { label: "طابور QR", section: "العمليات" },
  "/admin/customers": { label: "عملاء المنصة", section: "العمليات" },
  "/admin/businesses": { label: "الأعمال", section: "العمليات" },
  "/admin/usage-stats": { label: "إحصائيات الاستخدام", section: "العمليات" },
  "/admin/customer-cap": { label: "حدّ العملاء", section: "العمليات" },
  "/admin/import": { label: "استيراد العملاء", section: "العمليات" },
  "/admin/shipping": { label: "شركات الشحن", section: "العمليات" },
  "/admin/whatsapp": { label: "حالة واتساب", section: "الدعم" },
  "/admin/staff": { label: "إدارة الطاقم", section: "الدعم" },
  "/admin/internal-kb": { label: "المعرفة الداخلية", section: "الدعم" },
  "/admin/activation": { label: "قُمع التفعيل", section: "التسويق" },
  "/admin/system-health": { label: "صحة النظام", section: "التقنية" },
  "/admin/metrics": { label: "المقاييس", section: "التقنية" },
  "/admin/tenant-costs": { label: "التكلفة لكل تاجر", section: "التقنية" },
  "/admin/ai-logs": { label: "سجل الذكاء", section: "التقنية" },
  "/admin/ai-control": { label: "التحكم بالذكاء", section: "التقنية" },
  "/admin/embeddings": { label: "التضمين والفهرسة", section: "التقنية" },
  "/admin/knowledge-brain": { label: "العقل المعرفي", section: "التقنية" },
  "/admin/brain": { label: "مركز الدماغ", section: "التقنية" },
  "/admin/brain/global": { label: "الدماغ العالمي", section: "التقنية" },
  "/admin/brain/marketplace": { label: "سوق الأدمغة", section: "التقنية" },
  "/admin/agents": { label: "مركز الوكلاء", section: "التقنية" },
  "/admin/api-keys": { label: "مفاتيح API", section: "التقنية" },
  "/admin/integrations": { label: "التكاملات", section: "التقنية" },
  "/admin/protection-logs": { label: "سجل الحماية", section: "التقنية" },
  "/admin/audit-log": { label: "سجل النشاط", section: "التقنية" },
  "/admin/feature-flags": { label: "مفاتيح النظام", section: "التقنية" },
  "/admin/settings": { label: "إعدادات الموقع", section: "الإعدادات" },
  "/admin/plans": { label: "الباقات والحدود", section: "الإعدادات" },
  "/admin/white-label": { label: "العلامة البيضاء", section: "الإعدادات" },
  "/admin/payment-methods": { label: "طرق الدفع", section: "الإعدادات" },
  "/admin/payment-accounts": { label: "حسابات الاستلام", section: "الإعدادات" },
  "/admin/memberships": { label: "مصفوفة الباقات", section: "الإعدادات" },
  "/admin/membership-audit": { label: "تدقيق الباقات", section: "الإعدادات" },
};

function Sep() {
  return <ChevronLeft className="h-3 w-3 shrink-0 text-slate-600" aria-hidden />;
}

export function DashboardBreadcrumb() {
  const pathname = usePathname();

  // Exact match first, then longest-prefix match (for dynamic routes)
  let entry = DASHBOARD_LABELS[pathname];
  if (!entry) {
    const sorted = Object.keys(DASHBOARD_LABELS).sort((a, b) => b.length - a.length);
    const prefix = sorted.find((k) => pathname.startsWith(k + "/"));
    if (prefix) entry = DASHBOARD_LABELS[prefix];
  }
  if (!entry) return null;

  const parts: { label: string; href?: string }[] = [
    { label: "لوحة التحكم", href: "/dashboard" },
  ];
  if (entry.workspace && pathname !== "/dashboard") {
    parts.push({ label: entry.workspace });
  }
  if (pathname !== "/dashboard") {
    parts.push({ label: entry.label });
  }

  return (
    <nav aria-label="breadcrumb" className="mb-4 flex items-center gap-1.5 text-[12px] text-slate-500" dir="rtl">
      {parts.map((p, i) => {
        const isLast = i === parts.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <Sep />}
            {p.href && !isLast ? (
              <Link href={p.href} className="hover:text-slate-300 transition-colors">{p.label}</Link>
            ) : (
              <span className={isLast ? "text-slate-300 font-medium" : ""}>{p.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export function AdminBreadcrumb() {
  const pathname = usePathname();

  let entry = ADMIN_LABELS[pathname];
  if (!entry) {
    const sorted = Object.keys(ADMIN_LABELS).sort((a, b) => b.length - a.length);
    const prefix = sorted.find((k) => pathname.startsWith(k + "/"));
    if (prefix) entry = ADMIN_LABELS[prefix];
  }
  if (!entry) return null;

  const parts: { label: string; href?: string }[] = [
    { label: "الإدارة", href: "/admin" },
  ];
  if (entry.section) {
    parts.push({ label: entry.section });
  }
  if (pathname !== "/admin") {
    parts.push({ label: entry.label });
  }

  return (
    <nav aria-label="breadcrumb" className="mb-4 flex items-center gap-1.5 text-[12px] text-slate-500" dir="rtl">
      {parts.map((p, i) => {
        const isLast = i === parts.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <Sep />}
            {p.href && !isLast ? (
              <Link href={p.href} className="hover:text-slate-300 transition-colors">{p.label}</Link>
            ) : (
              <span className={isLast ? "text-slate-300 font-medium" : ""}>{p.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
