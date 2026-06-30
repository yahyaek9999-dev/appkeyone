"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Settings, LogOut, ShieldCheck, BarChart3, Building2,
  Crown, ShoppingBag, Phone, Brain, Shield, Activity, UserCheck, Coins, Rocket, Wallet,
  KeyRound, Send, Download, CreditCard, LayoutGrid, TrendingUp, CalendarClock, BookOpen, Globe, Plug,
} from "lucide-react";

type AdminLink = { href: string; label: string; icon: typeof LayoutDashboard; core?: boolean };
type AdminGroup = { title: string; icon: typeof LayoutDashboard; items: AdminLink[] };

/**
 * Admin nav grouped into business categories with progressive disclosure.
 * Beginner mode (default) shows only the ~14 daily-essential destinations
 * (core:true); "⚙ عرض كل الأدوات" reveals every tool. Duplicate/rare pages are
 * advanced-only — still reachable, just not in the calm default view.
 */
export const ADMIN_GROUPS: AdminGroup[] = [
  { title: "الرئيسية", icon: LayoutDashboard, items: [
    { href: "/admin", label: "نظرة عامة", icon: LayoutDashboard, core: true },
    { href: "/admin/super-center", label: "المركز الموحّد", icon: LayoutGrid, core: true },
  ] },
  { title: "المالية", icon: Wallet, items: [
    { href: "/admin/payment-reviews", label: "مراجعة المدفوعات", icon: CreditCard, core: true },
    { href: "/admin/upgrade-requests", label: "طلبات الترقية", icon: Rocket, core: true },
    { href: "/admin/wallet", label: "المحفظة وفوترة Meta", icon: Wallet, core: true },
    { href: "/admin/payments", label: "المدفوعات والبوابات", icon: CreditCard, core: true },
    { href: "/admin/analytics", label: "تحليلات الإيرادات", icon: TrendingUp, core: true },
    { href: "/admin/broadcast-credits", label: "رصيد الحملات (QR)", icon: Send },
    { href: "/admin/reports", label: "التقارير التنفيذية", icon: BarChart3 },
  ] },
  { title: "العمليات", icon: Activity, items: [
    { href: "/admin/operations-center", label: "مركز العمليات", icon: Activity, core: true },
    { href: "/admin/meta", label: "منصة Meta", icon: Globe, core: true },
    { href: "/admin/users", label: "العملاء والاشتراكات", icon: Users, core: true },
    { href: "/admin/orders", label: "إدارة الطلبات", icon: ShoppingBag, core: true },
    { href: "/admin/incidents", label: "الحوادث", icon: ShieldCheck, core: true },
    { href: "/admin/qr-queue", label: "طابور جلسات QR", icon: CalendarClock },
    { href: "/admin/customers", label: "عملاء المنصة", icon: UserCheck },
    { href: "/admin/businesses", label: "الأعمال", icon: Building2 },
    { href: "/admin/usage-stats", label: "إحصائيات الاستخدام", icon: Activity },
    { href: "/admin/customer-cap", label: "حدّ العملاء", icon: Activity },
    { href: "/admin/import", label: "استيراد العملاء", icon: Download },
  ] },
  { title: "الدعم", icon: Phone, items: [
    { href: "/admin/whatsapp", label: "حالة واتساب", icon: Phone, core: true },
    { href: "/docs", label: "مركز المساعدة", icon: BookOpen, core: true },
    { href: "/admin/staff", label: "إدارة الطاقم", icon: Users },
    { href: "/admin/internal-kb", label: "المعرفة الداخلية", icon: BarChart3 },
  ] },
  { title: "التسويق", icon: Rocket, items: [
    { href: "/admin/activation", label: "قُمع التفعيل", icon: Rocket },
  ] },
  { title: "التقنية", icon: Brain, items: [
    { href: "/admin/metrics", label: "المقاييس والاستخدام", icon: BarChart3 },
    { href: "/admin/tenant-costs", label: "التكلفة والأداء لكل تاجر", icon: Coins },
    { href: "/admin/ai-logs", label: "سجل الذكاء الاصطناعي", icon: Brain },
    { href: "/admin/knowledge-brain", label: "العقل المعرفي", icon: Brain },
    { href: "/admin/brain", label: "مركز الدماغ", icon: Brain },
    { href: "/admin/brain/global", label: "الدماغ العالمي", icon: Brain },
    { href: "/admin/api-keys", label: "مفاتيح API", icon: KeyRound },
    { href: "/admin/integrations", label: "التكاملات والمفاتيح", icon: Plug },
    { href: "/admin/protection-logs", label: "سجل الحماية", icon: Shield },
  ] },
  { title: "الإعدادات", icon: Settings, items: [
    { href: "/admin/settings", label: "إعدادات الموقع", icon: Settings, core: true },
    { href: "/admin/plans", label: "الباقات والحدود", icon: Crown },
    { href: "/admin/payment-methods", label: "طرق الدفع", icon: CreditCard },
    { href: "/admin/payment-accounts", label: "حسابات الاستلام", icon: Wallet },
    { href: "/admin/memberships", label: "مصفوفة الباقات", icon: Crown },
    { href: "/admin/membership-audit", label: "تدقيق عزل الباقات", icon: Shield },
  ] },
];

// Back-compat flat list (derived; previously the source of truth).
export const ADMIN_LINKS = ADMIN_GROUPS.flatMap((g) => g.items);

const ADMIN_MODE_KEY = "keyone_admin_nav_simple";

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/");
}

export function AdminNavLinks() {
  const pathname = usePathname();
  const [simple, setSimple] = useState(true);
  useEffect(() => { try { setSimple(localStorage.getItem(ADMIN_MODE_KEY) !== "0"); } catch {} }, []);
  function toggle() { setSimple((v) => { const n = !v; try { localStorage.setItem(ADMIN_MODE_KEY, n ? "1" : "0"); } catch {} return n; }); }

  const groups = ADMIN_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => !simple || i.core || isActive(pathname, i.href)) }))
    .filter((g) => g.items.length > 0);

  return (
    <nav className="flex-1 space-y-3 overflow-y-auto px-2 py-2">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="flex items-center gap-1.5 px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            <g.icon className="h-3 w-3" />
            {g.title}
          </div>
          <div className="space-y-0.5">
            {g.items.map((n) => {
              const Icon = n.icon;
              const active = isActive(pathname, n.href);
              return (
                <Link key={n.href} href={n.href} className={cn("sidebar-link", active && "sidebar-link-active")}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{n.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      <button onClick={toggle} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2 text-[11px] text-slate-400 hover:bg-white/[0.05] hover:text-slate-200">
        {simple ? "⚙ عرض كل الأدوات" : "↩ الأساسيات فقط"}
      </button>
    </nav>
  );
}
