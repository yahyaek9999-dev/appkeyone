"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Settings, LogOut, ShieldCheck, BarChart3, Building2,
  Crown, ShoppingBag, Phone, Brain, Shield, Activity, UserCheck, Coins, Rocket,
} from "lucide-react";

export const ADMIN_LINKS = [
  { href: "/admin", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/admin/activation", label: "قُمع التفعيل", icon: Rocket },
  { href: "/admin/users", label: "العملاء والاشتراكات", icon: Users },
  { href: "/admin/businesses", label: "الأعمال", icon: Building2 },
  { href: "/admin/customers", label: "عملاء المنصة", icon: UserCheck },
  { href: "/admin/orders", label: "إدارة الطلبات", icon: ShoppingBag },
  { href: "/admin/plans", label: "الباقات والحدود", icon: Crown },
  { href: "/admin/metrics", label: "المقاييس والاستخدام", icon: BarChart3 },
  { href: "/admin/tenant-costs", label: "التكلفة والأداء لكل تاجر", icon: Coins },
  { href: "/admin/usage-stats", label: "إحصائيات الاستخدام", icon: Activity },
  { href: "/admin/ai-logs", label: "سجل الذكاء الاصطناعي", icon: Brain },
  { href: "/admin/knowledge-brain", label: "العقل المعرفي", icon: Brain },
  { href: "/admin/protection-logs", label: "سجل الحماية", icon: Shield },
  { href: "/admin/whatsapp", label: "حالة واتساب", icon: Phone },
  { href: "/admin/settings", label: "إعدادات الموقع", icon: Settings },
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
