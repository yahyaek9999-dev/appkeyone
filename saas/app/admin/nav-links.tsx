"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Settings, LogOut, ShieldCheck, BarChart3, Building2,
  Crown, ShoppingBag, Phone, Brain, Shield, Activity, UserCheck, Coins, Rocket, Wallet,
  KeyRound, Send, Download, CreditCard, LayoutGrid, TrendingUp, CalendarClock, BookOpen, Globe, Plug, Cpu, Database, Truck, Palette, ScrollText, ToggleLeft, HeartPulse, Timer,
} from "lucide-react";

type AdminLink = { href: string; label: string; icon: typeof LayoutDashboard; core?: boolean };
type AdminGroup = { title: string; icon: typeof LayoutDashboard; items: AdminLink[] };

/**
 * Admin nav — ONE canonical structure, organised by business domain rather than
 * by which team happened to build the page. Every destination lives in exactly
 * one section; there are no duplicate entries.
 *
 * Progressive disclosure: beginner mode (default) shows only the daily-essential
 * destinations (core:true); "⚙ عرض كل الأدوات" reveals every tool.
 *
 * Section order mirrors the operational day: what needs attention → who the
 * customers are → what they pay → what the product does → what ships → how we
 * talk to them → what runs → who operates it → what's secure → configuration →
 * plumbing.
 */
export const ADMIN_GROUPS: AdminGroup[] = [
  // ── A. OVERVIEW ───────────────────────────────────────────────────────────
  { title: "النظرة العامة", icon: LayoutDashboard, items: [
    { href: "/admin", label: "لوحة التحكم", icon: LayoutDashboard, core: true },
    { href: "/admin/super-center", label: "مركز الانتباه", icon: LayoutGrid, core: true },
    { href: "/admin/system-health", label: "صحة النظام", icon: HeartPulse, core: true },
    { href: "/admin/analytics", label: "الإيرادات", icon: TrendingUp, core: true },
    { href: "/admin/usage-stats", label: "الاستخدام", icon: Activity, core: true },
    { href: "/admin/incidents", label: "الحوادث", icon: ShieldCheck, core: true },
    { href: "/admin/reports", label: "التقارير التنفيذية", icon: BarChart3 },
  ] },

  // ── B. CUSTOMERS ──────────────────────────────────────────────────────────
  { title: "العملاء", icon: Users, items: [
    { href: "/admin/users", label: "العملاء والاشتراكات", icon: Users, core: true },
    { href: "/admin/customers", label: "عملاء المنصة", icon: UserCheck },
    { href: "/admin/businesses", label: "الأنشطة التجارية", icon: Building2 },
    { href: "/admin/activation", label: "قُمع التفعيل", icon: Rocket },
    { href: "/admin/customer-cap", label: "حدّ العملاء", icon: Activity },
    { href: "/admin/import", label: "استيراد العملاء", icon: Download },
  ] },

  // ── C. MEMBERSHIPS & BILLING ──────────────────────────────────────────────
  { title: "الباقات والفوترة", icon: Crown, items: [
    { href: "/admin/plans", label: "الباقات والحدود", icon: Crown, core: true },
    { href: "/admin/promotions", label: "العروض والتخفيضات", icon: Send, core: true },
    { href: "/admin/commercial", label: "التحكم التجاري", icon: Coins, core: true },
    { href: "/admin/payment-reviews", label: "مراجعة المدفوعات", icon: CreditCard, core: true },
    { href: "/admin/upgrade-requests", label: "طلبات الترقية", icon: Rocket, core: true },
    { href: "/admin/payments", label: "المدفوعات", icon: CreditCard, core: true },
    { href: "/admin/payment-gateways", label: "بوابات الدفع", icon: CreditCard, core: true },
    { href: "/admin/wallet", label: "المحفظة وفوترة Meta", icon: Wallet },
    { href: "/admin/payment-methods", label: "طرق الدفع", icon: CreditCard },
    { href: "/admin/payment-accounts", label: "حسابات الاستلام", icon: Wallet },
    { href: "/admin/memberships", label: "مصفوفة الباقات", icon: Crown },
    { href: "/admin/membership-audit", label: "تدقيق عزل الباقات", icon: Shield },
  ] },

  // ── D. PRODUCT ────────────────────────────────────────────────────────────
  { title: "المنتج", icon: ToggleLeft, items: [
    { href: "/admin/feature-control", label: "مركز الميزات", icon: ToggleLeft, core: true },
    { href: "/admin/feature-flags", label: "مفاتيح النظام (env)", icon: ToggleLeft },
  ] },

  // ── E. RELEASES ───────────────────────────────────────────────────────────
  { title: "الإصدارات", icon: Rocket, items: [
    { href: "/admin/releases", label: "إدارة الإصدارات", icon: Rocket, core: true },
  ] },

  // ── F. COMMUNICATIONS ─────────────────────────────────────────────────────
  { title: "الاتصالات", icon: Send, items: [
    { href: "/admin/broadcast-credits", label: "رصيد الحملات", icon: Send, core: true },
  ] },

  // ── G. OPERATIONS ─────────────────────────────────────────────────────────
  { title: "التشغيل", icon: Activity, items: [
    { href: "/admin/operations-center", label: "مركز العمليات", icon: Activity, core: true },
    { href: "/admin/orders", label: "الطلبات", icon: ShoppingBag, core: true },
    { href: "/admin/whatsapp", label: "حالة واتساب", icon: Phone, core: true },
    { href: "/admin/meta", label: "منصة Meta", icon: Globe, core: true },
    { href: "/admin/qr-queue", label: "طابور جلسات QR", icon: CalendarClock },
    { href: "/admin/jobs", label: "المهام المجدولة", icon: Timer, core: true },
    { href: "/admin/shipping", label: "شركات الشحن", icon: Truck },
  ] },

  // ── H. TEAM ───────────────────────────────────────────────────────────────
  { title: "الفريق", icon: UserCheck, items: [
    { href: "/admin/staff", label: "طاقم الإدارة", icon: Users, core: true },
  ] },

  // ── I. SECURITY ───────────────────────────────────────────────────────────
  { title: "الأمان", icon: Shield, items: [
    { href: "/admin/audit-log", label: "سجل التدقيق", icon: ScrollText, core: true },
    { href: "/admin/protection-logs", label: "سجل الحماية", icon: Shield },
  ] },

  // ── J. SETTINGS ───────────────────────────────────────────────────────────
  { title: "الإعدادات", icon: Settings, items: [
    { href: "/admin/settings", label: "إعدادات المنصة", icon: Settings, core: true },
    { href: "/admin/white-label", label: "العلامة البيضاء", icon: Palette },
  ] },

  // ── K. TECHNICAL ──────────────────────────────────────────────────────────
  { title: "التقنية", icon: Cpu, items: [
    { href: "/admin/ai-control", label: "التحكم بالذكاء الاصطناعي", icon: Cpu, core: true },
    { href: "/admin/integrations", label: "التكاملات", icon: Plug },
    { href: "/admin/api-keys", label: "مفاتيح API", icon: KeyRound },
    { href: "/admin/metrics", label: "المقاييس", icon: BarChart3 },
    { href: "/admin/tenant-costs", label: "التكلفة لكل تاجر", icon: Coins },
    { href: "/admin/ai-logs", label: "سجل الذكاء الاصطناعي", icon: Brain },
    { href: "/admin/embeddings", label: "التضمين والفهرسة", icon: Database },
    { href: "/admin/knowledge-brain", label: "العقل المعرفي", icon: Brain },
    { href: "/admin/brain", label: "مركز الدماغ", icon: Brain },
    { href: "/admin/agents", label: "مركز الوكلاء", icon: Activity },
    { href: "/admin/internal-kb", label: "المعرفة الداخلية", icon: BookOpen },
    { href: "/docs", label: "مركز المساعدة", icon: BookOpen },
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
