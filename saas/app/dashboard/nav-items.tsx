"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { can, type Permission, type Role } from "@/lib/rbac";
import {
  LayoutDashboard,
  Bot,
  BookOpen,
  Users,
  MessageSquare,
  Settings,
  Phone,
  Shield,
  Inbox,
  Zap,
  Clock,
  Megaphone,
  Lightbulb,
  BarChart3,
  ShoppingBag,
  Plug,
  Brain,
  Crown,
  MessageSquareWarning,
  HeartHandshake,
  Filter,
  TrendingUp,
  Package,
  Ticket,
  Activity,
  Download,
} from "lucide-react";

export const NAV_SECTIONS: {
  title: string;
  items: { href: string; label: string; icon: typeof LayoutDashboard; perm: Permission }[];
}[] = [
  {
    title: "الرئيسية",
    items: [
      { href: "/dashboard", label: "نظرة عامة", icon: LayoutDashboard, perm: "analytics" },
      { href: "/dashboard/analytics", label: "الإحصائيات", icon: BarChart3, perm: "analytics" },
      { href: "/dashboard/revenue-forecast", label: "توقّع الإيرادات", icon: TrendingUp, perm: "analytics" },
    ],
  },
  {
    title: "المحادثات",
    items: [
      { href: "/dashboard/inbox", label: "الواردات", icon: Inbox, perm: "inbox" },
      { href: "/dashboard/escalations", label: "التصعيدات", icon: MessageSquareWarning, perm: "escalations" },
      { href: "/dashboard/customers", label: "العملاء", icon: Users, perm: "customers" },
      { href: "/dashboard/leads", label: "العملاء المحتملون", icon: Zap, perm: "customers" },
    ],
  },
  {
    title: "التجارة",
    items: [
      { href: "/dashboard/orders", label: "الطلبات", icon: ShoppingBag, perm: "customers" },
      { href: "/dashboard/products", label: "المنتجات", icon: Package, perm: "settings" },
      { href: "/dashboard/coupons", label: "الكوبونات", icon: Ticket, perm: "settings" },
      { href: "/dashboard/integrations", label: "تكاملات التجارة", icon: Plug, perm: "settings" },
      { href: "/dashboard/automations", label: "أتمتة التجارة", icon: Zap, perm: "settings" },
    ],
  },
  {
    title: "النمو والذكاء",
    items: [
      { href: "/dashboard/sales-brain", label: "عقل المبيعات", icon: Brain, perm: "analytics" },
      { href: "/dashboard/intel", label: "ذكاء المبيعات", icon: Lightbulb, perm: "analytics" },
      { href: "/dashboard/funnel", label: "مسار البيع", icon: Filter, perm: "analytics" },
      { href: "/dashboard/segments", label: "شرائح العملاء", icon: Users, perm: "analytics" },
      { href: "/dashboard/broadcasts", label: "الإرسال الجماعي", icon: Megaphone, perm: "broadcasts" },
      { href: "/dashboard/recovery", label: "استعادة العملاء", icon: HeartHandshake, perm: "broadcasts" },
    ],
  },
  {
    title: "إعداد البوت",
    items: [
      { href: "/dashboard/bot", label: "إعدادات البوت", icon: Bot, perm: "settings" },
      { href: "/dashboard/quick-replies", label: "الردود السريعة", icon: MessageSquare, perm: "settings" },
      { href: "/dashboard/working-hours", label: "ساعات العمل", icon: Clock, perm: "settings" },
      { href: "/dashboard/knowledge", label: "مركز التدريب", icon: BookOpen, perm: "settings" },
      { href: "/dashboard/suggestions", label: "اقتراحات المعرفة", icon: Lightbulb, perm: "settings" },
      { href: "/dashboard/playground", label: "تجربة البوت", icon: Bot, perm: "settings" },
      { href: "/dashboard/whatsapp", label: "ربط واتساب", icon: Phone, perm: "settings" },
    ],
  },
  {
    title: "الحساب والنظام",
    items: [
      { href: "/dashboard/safety", label: "الأمان والحماية", icon: Shield, perm: "settings" },
      { href: "/dashboard/usage", label: "استخدام الباقة", icon: Crown, perm: "analytics" },
      { href: "/dashboard/system-health", label: "مراقبة النظام", icon: Activity, perm: "analytics" },
      { href: "/dashboard/export", label: "تصدير البيانات", icon: Download, perm: "customers" },
      { href: "/dashboard/settings", label: "حسابي", icon: Settings, perm: "analytics" },
    ],
  },
];

// Flat list kept for callers that need a simple lookup (e.g. mobile header label).
export const NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

export function NavLinks({ role = "owner" }: { role?: Role }) {
  return <NavList role={role} />;
}

export function SidebarNav({ adminLink, role = "owner" }: { adminLink: React.ReactNode; role?: Role }) {
  return <NavList adminLink={adminLink} role={role} />;
}

function NavList({ adminLink, role = "owner" }: { adminLink?: React.ReactNode; role?: Role }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
      {adminLink && <div className="px-1">{adminLink}</div>}
      {NAV_SECTIONS.map((section) => {
        const items = section.items.filter((n) => can(role, n.perm));
        if (items.length === 0) return null;
        return (
          <div key={section.title} className="space-y-0.5">
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              {section.title}
            </div>
            {items.map((n) => {
              const Icon = n.icon;
              const active = isActive(n.href);
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
          </div>
        );
      })}
    </nav>
  );
}
