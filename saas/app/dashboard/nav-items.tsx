"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
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
} from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "نظرة عامة", icon: LayoutDashboard },
  { href: "/dashboard/analytics", label: "الإحصائيات", icon: BarChart3 },
  { href: "/dashboard/inbox", label: "الواردات", icon: Inbox },
  { href: "/dashboard/escalations", label: "التصعيدات", icon: MessageSquareWarning },
  { href: "/dashboard/orders", label: "الطلبات", icon: ShoppingBag },
  { href: "/dashboard/integrations", label: "تكاملات التجارة", icon: Plug },
  { href: "/dashboard/sales-brain", label: "عقل المبيعات", icon: Brain },
  { href: "/dashboard/intel", label: "ذكاء المبيعات", icon: Brain },
  { href: "/dashboard/funnel", label: "مسار البيع", icon: Filter },
  { href: "/dashboard/segments", label: "شرائح العملاء", icon: Users },
  { href: "/dashboard/revenue-forecast", label: "توقّع الإيرادات", icon: TrendingUp },
  { href: "/dashboard/leads", label: "العملاء المحتملون", icon: Zap },
  { href: "/dashboard/broadcasts", label: "الإرسال الجماعي", icon: Megaphone },
  { href: "/dashboard/recovery", label: "استعادة العملاء", icon: HeartHandshake },
  { href: "/dashboard/customers", label: "العملاء", icon: Users },
  { href: "/dashboard/bot", label: "إعدادات البوت", icon: Bot },
  { href: "/dashboard/quick-replies", label: "الردود السريعة", icon: MessageSquare },
  { href: "/dashboard/working-hours", label: "ساعات العمل", icon: Clock },
  { href: "/dashboard/knowledge", label: "قاعدة المعرفة", icon: BookOpen },
  { href: "/dashboard/suggestions", label: "اقتراحات المعرفة", icon: Lightbulb },
  { href: "/dashboard/playground", label: "تجربة البوت", icon: Bot },
  { href: "/dashboard/whatsapp", label: "ربط واتساب", icon: Phone },
  { href: "/dashboard/safety", label: "الأمان والحماية", icon: Shield },
  { href: "/dashboard/usage", label: "استخدام الباقة", icon: Crown },
  { href: "/dashboard/settings", label: "حسابي", icon: Settings },
];

export function NavLinks() {
  return <NavList />;
}

export function SidebarNav({ adminLink }: { adminLink: React.ReactNode }) {
  return <NavList adminLink={adminLink} />;
}

function NavList({ adminLink }: { adminLink?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
      {adminLink && <div className="mb-1 px-1">{adminLink}</div>}
      {NAV_ITEMS.map((n) => {
        const Icon = n.icon;
        const active = pathname === n.href || pathname.startsWith(n.href + "/");
        return (
          <Link
            key={n.href}
            href={n.href}
            className={cn(
              "sidebar-link",
              active && "sidebar-link-active",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
