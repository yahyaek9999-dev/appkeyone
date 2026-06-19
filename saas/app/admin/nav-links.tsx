"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Settings, LogOut, ShieldCheck, BarChart3, Building2,
  Crown, ShoppingBag, Phone, Brain, Shield, Activity, UserCheck, Coins, Rocket, Wallet,
  KeyRound, Send, Download, CreditCard, LayoutGrid, TrendingUp, CalendarClock, BookOpen,
} from "lucide-react";

export const ADMIN_LINKS = [
  { href: "/admin", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/admin/super-center", label: "المركز الموحّد", icon: LayoutGrid },
  { href: "/admin/activation", label: "قُمع التفعيل", icon: Rocket },
  { href: "/admin/users", label: "العملاء والاشتراكات", icon: Users },
  { href: "/admin/businesses", label: "الأعمال", icon: Building2 },
  { href: "/admin/customers", label: "عملاء المنصة", icon: UserCheck },
  { href: "/admin/orders", label: "إدارة الطلبات", icon: ShoppingBag },
  { href: "/admin/plans", label: "الباقات والحدود", icon: Crown },
  { href: "/admin/wallet", label: "المحفظة وفوترة Meta", icon: Wallet },
  { href: "/admin/analytics", label: "تحليلات الإيرادات", icon: TrendingUp },
  { href: "/admin/payments", label: "المدفوعات والبوابات", icon: CreditCard },
  { href: "/admin/qr-queue", label: "طابور جلسات QR", icon: CalendarClock },
  { href: "/admin/broadcast-credits", label: "رصيد الحملات (QR)", icon: Send },
  { href: "/admin/import", label: "استيراد العملاء", icon: Download },
  { href: "/admin/api-keys", label: "مفاتيح API", icon: KeyRound },
  { href: "/admin/customer-cap", label: "حدّ العملاء", icon: Activity },
  { href: "/admin/upgrade-requests", label: "طلبات الترقية", icon: Rocket },
  { href: "/admin/metrics", label: "المقاييس والاستخدام", icon: BarChart3 },
  { href: "/admin/tenant-costs", label: "التكلفة والأداء لكل تاجر", icon: Coins },
  { href: "/admin/usage-stats", label: "إحصائيات الاستخدام", icon: Activity },
  { href: "/admin/ai-logs", label: "سجل الذكاء الاصطناعي", icon: Brain },
  { href: "/admin/knowledge-brain", label: "العقل المعرفي", icon: Brain },
  { href: "/admin/protection-logs", label: "سجل الحماية", icon: Shield },
  { href: "/admin/whatsapp", label: "حالة واتساب", icon: Phone },
  // Operations & Billing
  { href: "/admin/operations-center", label: "مركز العمليات", icon: Activity },
  { href: "/admin/payment-reviews", label: "مراجعة المدفوعات", icon: CreditCard },
  { href: "/admin/payment-methods", label: "طرق الدفع", icon: CreditCard },
  { href: "/admin/payment-accounts", label: "حسابات الاستلام", icon: Wallet },
  { href: "/admin/staff", label: "إدارة الطاقم", icon: Users },
  { href: "/admin/incidents", label: "الحوادث", icon: ShieldCheck },
  { href: "/admin/internal-kb", label: "المعرفة الداخلية", icon: BarChart3 },
  { href: "/admin/memberships", label: "مصفوفة الباقات", icon: Crown },
  { href: "/admin/membership-audit", label: "تدقيق عزل الباقات", icon: Shield },
  // Brain & Intelligence
  { href: "/admin/brain", label: "مركز الدماغ", icon: Brain },
  { href: "/admin/brain/global", label: "الدماغ العالمي", icon: Brain },
  // HIDDEN (final-polish): not production-ready — re-enable when complete
  // { href: "/admin/brain/marketplace", label: "متجر الأدمغة", icon: Coins },
  // { href: "/admin/agents", label: "مركز الوكلاء", icon: Users },
  { href: "/admin/reports", label: "التقارير التنفيذية", icon: BarChart3 },
  // HIDDEN (final-polish): not production-ready — branding not yet applied at runtime
  // { href: "/admin/white-label", label: "العلامة البيضاء", icon: LayoutGrid },
  { href: "/admin/settings", label: "إعدادات الموقع", icon: Settings },
  { href: "/docs", label: "مركز المساعدة", icon: BookOpen },
];

export function AdminNavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
      {ADMIN_LINKS.map((n) => {
        const Icon = n.icon;
        const active = pathname === n.href;
        return (
          <Link
            key={n.href}
            href={n.href}
            className={cn("sidebar-link", active && "sidebar-link-active")}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
