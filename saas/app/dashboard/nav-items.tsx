"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  Megaphone,
  BarChart3,
  ShoppingBag,
  Plug,
  Brain,
  Crown,
  Sparkles,
  Briefcase,
  Wrench,
  Package,
  TrendingUp,
  PieChart,
  Lightbulb,
  Activity,
  FlaskConical,
  Gauge,
  AlertTriangle,
  ScrollText,
  ShieldAlert,
  RotateCcw,
  Filter,
  Layers,
  Building2,
  Download,
  Ticket,
  Rocket,
  Database,
  ShieldCheck,
  Beaker,
  Workflow,
  CheckSquare,
  Palette,
  Wallet,
  Code2,
  Send,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  perm: Permission;
};

/**
 * Workspace architecture (Business-OS model, not an admin panel).
 *
 * The product is organised into a handful of WORKSPACES — Home, Sales,
 * Customers, AI, Operations, Settings. The left chrome is a slim icon RAIL
 * (one glyph per workspace) plus a CONTEXTUAL PANEL that only shows the routes
 * belonging to the active workspace. You never see all 35 destinations at once;
 * you see the ~6 that matter for what you're doing. This is the Attio / Linear
 * navigation register, and it's what makes KEYONE read as an operating system
 * rather than a dashboard template.
 */
export type Workspace = {
  id: string;
  label: string;
  /** Short label shown under the rail glyph. */
  short: string;
  icon: LucideIcon;
  /** First destination — where clicking the rail glyph lands you. */
  home: string;
  items: NavItem[];
};

/**
 * Lean workspace model — workspaces with grouped destinations.
 * The contextual sidebar only shows ONE workspace's items at a time (never all
 * at once), so density stays low even as the catalogue grows. The command
 * palette (⌘K) indexes ALL destinations (NAV_ITEMS is derived from WORKSPACES)
 * so every route is reachable from either the sidebar or the palette — never
 * URL-only.
 */
export const WORKSPACES: Workspace[] = [
  {
    id: "home",
    label: "الرئيسية",
    short: "الرئيسية",
    icon: LayoutDashboard,
    home: "/dashboard",
    items: [
      { href: "/dashboard", label: "نظرة عامة", icon: LayoutDashboard, perm: "analytics" },
      { href: "/dashboard/analytics", label: "التحليلات", icon: BarChart3, perm: "analytics" },
      { href: "/dashboard/command-center", label: "مركز القيادة", icon: Sparkles, perm: "analytics" },
    ],
  },
  {
    id: "sales",
    label: "المبيعات",
    short: "المبيعات",
    icon: Briefcase,
    home: "/dashboard/orders",
    items: [
      { href: "/dashboard/orders", label: "الطلبات", icon: ShoppingBag, perm: "customers" },
      { href: "/dashboard/products", label: "المنتجات", icon: Package, perm: "settings" },
      { href: "/dashboard/broadcasts", label: "الإرسال الجماعي", icon: Megaphone, perm: "broadcasts" },
      { href: "/dashboard/broadcasts-pro", label: "حملات الرصيد (QR)", icon: Send, perm: "broadcasts" },
    ],
  },
  {
    id: "customers",
    label: "العملاء",
    short: "العملاء",
    icon: Users,
    home: "/dashboard/customers",
    items: [
      { href: "/dashboard/customers", label: "العملاء", icon: Users, perm: "customers" },
      { href: "/dashboard/inbox", label: "صندوق المحادثات", icon: Inbox, perm: "inbox" },
      { href: "/dashboard/leads", label: "العملاء المحتملون", icon: Zap, perm: "customers" },
      { href: "/dashboard/import", label: "استيراد العملاء", icon: Download, perm: "customers" },
    ],
  },
  {
    id: "ai",
    label: "ذكاء الأعمال",
    short: "الرؤى",
    icon: Brain,
    home: "/dashboard/bot",
    items: [
      { href: "/dashboard/bot", label: "المساعد الذكي", icon: Bot, perm: "settings" },
      { href: "/dashboard/knowledge", label: "المعرفة", icon: BookOpen, perm: "settings" },
      { href: "/dashboard/knowledge-brain", label: "عقل المعرفة", icon: Brain, perm: "settings" },
      { href: "/dashboard/sales-brain", label: "عقل المبيعات", icon: Sparkles, perm: "analytics" },
      { href: "/dashboard/revenue-copilot", label: "مساعد الإيرادات", icon: TrendingUp, perm: "analytics" },
      { href: "/dashboard/revenue-forecast", label: "توقّع الإيرادات", icon: Gauge, perm: "analytics" },
      { href: "/dashboard/business-intelligence", label: "ذكاء الأعمال", icon: PieChart, perm: "analytics" },
      { href: "/dashboard/intel", label: "الرصد الذكي", icon: Activity, perm: "analytics" },
      { href: "/dashboard/suggestions", label: "الاقتراحات", icon: Lightbulb, perm: "analytics" },
      { href: "/dashboard/playground", label: "ساحة التجربة", icon: FlaskConical, perm: "settings" },
      { href: "/dashboard/quick-replies", label: "الردود السريعة", icon: MessageSquare, perm: "settings" },
      { href: "/dashboard/brain", label: "مركز الدماغ", icon: Brain, perm: "settings" },
      { href: "/dashboard/agents", label: "نظام الوكلاء", icon: Users, perm: "settings" },
    ],
  },
  {
    id: "growth",
    label: "النمو",
    short: "النمو",
    icon: Rocket,
    home: "/dashboard/funnel",
    items: [
      { href: "/dashboard/funnel", label: "قمع التحويل", icon: Filter, perm: "analytics" },
      { href: "/dashboard/segments", label: "الشرائح", icon: Layers, perm: "analytics" },
      { href: "/dashboard/recovery", label: "استعادة العملاء", icon: RotateCcw, perm: "broadcasts" },
      { href: "/dashboard/business", label: "أداء النشاط", icon: Building2, perm: "analytics" },
    ],
  },
  {
    id: "ops",
    label: "العمليات",
    short: "العمليات",
    icon: Wrench,
    home: "/dashboard/integrations",
    items: [
      { href: "/dashboard/integrations", label: "التكاملات", icon: Plug, perm: "settings" },
      { href: "/dashboard/automations", label: "الأتمتة", icon: Zap, perm: "settings" },
      { href: "/dashboard/flow-builder", label: "منشئ المسارات", icon: Workflow, perm: "settings" },
      { href: "/dashboard/branches", label: "الفروع", icon: Building2, perm: "settings" },
      { href: "/dashboard/approvals", label: "الموافقات", icon: CheckSquare, perm: "team" },
      { href: "/dashboard/whatsapp", label: "ربط واتساب", icon: Phone, perm: "settings" },
      { href: "/dashboard/whatsapp-health", label: "صحة جلسة واتساب", icon: Phone, perm: "settings" },
      { href: "/dashboard/meta-health", label: "صحة اتصال Meta", icon: ShieldCheck, perm: "settings" },
      { href: "/dashboard/ai-operations", label: "عمليات الذكاء", icon: Brain, perm: "settings" },
      { href: "/dashboard/qr-queue", label: "حجز جلسات QR", icon: CalendarClock, perm: "broadcasts" },
      { href: "/dashboard/escalations", label: "التصعيدات", icon: AlertTriangle, perm: "escalations" },
      { href: "/dashboard/safety", label: "الأمان", icon: ShieldAlert, perm: "settings" },
      { href: "/dashboard/compliance", label: "الامتثال والتسليم", icon: ShieldCheck, perm: "settings" },
      { href: "/dashboard/system-health", label: "صحة النظام", icon: Gauge, perm: "settings" },
      { href: "/dashboard/audit-log", label: "سجل التدقيق", icon: ScrollText, perm: "team" },
    ],
  },
  {
    id: "data",
    label: "البيانات",
    short: "البيانات",
    icon: Database,
    home: "/dashboard/export",
    items: [
      { href: "/dashboard/coupons", label: "الكوبونات", icon: Ticket, perm: "settings" },
      { href: "/dashboard/export", label: "تصدير البيانات", icon: Download, perm: "customers" },
      { href: "/dashboard/demo", label: "بيانات تجريبية", icon: Beaker, perm: "settings" },
    ],
  },
  {
    id: "settings",
    label: "الإعدادات",
    short: "الإعدادات",
    icon: Settings,
    home: "/dashboard/settings",
    items: [
      { href: "/dashboard/settings", label: "الحساب", icon: Settings, perm: "analytics" },
      { href: "/dashboard/settings/providers", label: "المزوّدون", icon: Plug, perm: "settings" },
      { href: "/dashboard/working-hours", label: "ساعات العمل", icon: Shield, perm: "settings" },
      { href: "/dashboard/white-label", label: "العلامة البيضاء", icon: Palette, perm: "settings" },
      { href: "/dashboard/usage", label: "الباقة", icon: Crown, perm: "analytics" },
      { href: "/dashboard/plan", label: "لوحة الباقة", icon: Gauge, perm: "analytics" },
      { href: "/dashboard/billing", label: "الاشتراك والدفع", icon: Wallet, perm: "billing" },
      { href: "/dashboard/wallet", label: "المحفظة والرصيد", icon: Wallet, perm: "billing" },
      { href: "/dashboard/developer", label: "مركز المطوّرين", icon: Code2, perm: "settings" },
    ],
  },
];

// ── Back-compat exports ───────────────────────────────────────────────────────
// Older callers (command palette, mobile header label) consume a flat list and a
// {title, items} section list. Derive both from WORKSPACES so there is a single
// source of truth.
export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = WORKSPACES.map(
  (w) => ({ title: w.label, items: w.items }),
);
export const NAV_ITEMS: NavItem[] = WORKSPACES.flatMap((w) => w.items);

function workspaceForPath(pathname: string): Workspace {
  // Longest-prefix match across all items wins; fall back to Home.
  let best: { ws: Workspace; len: number } | null = null;
  for (const ws of WORKSPACES) {
    for (const it of ws.items) {
      const match = it.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(it.href);
      if (match && (!best || it.href.length > best.len)) best = { ws, len: it.href.length };
    }
  }
  return best?.ws ?? WORKSPACES[0];
}

function isActivePath(pathname: string, href: string) {
  return href === "/dashboard"
    ? pathname === "/dashboard"
    : pathname === href || pathname.startsWith(href + "/");
}

function accessibleWorkspaces(role: Role): Workspace[] {
  return WORKSPACES.map((w) => ({ ...w, items: w.items.filter((i) => can(role, i.perm)) })).filter(
    (w) => w.items.length > 0,
  );
}

function ContextRow({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className={cn("sidebar-link relative", active && "sidebar-link-active")}>
      {active && (
        <span className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-brand-400" aria-hidden="true" />
      )}
      <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-brand-300" : "text-slate-500")} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/**
 * Desktop chrome: workspace icon RAIL + CONTEXTUAL panel. The rail is the
 * identity of the OS; the panel is the context you're working in.
 */
export function SidebarNav({ adminLink, role = "owner" }: { adminLink?: React.ReactNode; role?: Role }) {
  const pathname = usePathname();
  const spaces = accessibleWorkspaces(role);
  const currentWs = workspaceForPath(pathname);
  // Which workspace's items are shown in the panel. Defaults to the one holding
  // the current route; the user can preview another by clicking its rail glyph.
  const [viewId, setViewId] = useState(currentWs.id);
  useEffect(() => setViewId(currentWs.id), [currentWs.id]);

  const viewed = spaces.find((w) => w.id === viewId) ?? spaces[0];

  return (
    <div className="flex min-h-0 flex-1">
      {/* Rail */}
      <div className="flex w-[60px] shrink-0 flex-col items-center gap-1 border-l border-white/[0.06] py-3">
        {spaces.map((w) => {
          const Icon = w.icon;
          const isCurrent = w.id === currentWs.id;
          const isViewed = w.id === viewed.id;
          return (
            <button
              key={w.id}
              onClick={() => setViewId(w.id)}
              title={w.label}
              aria-label={w.label}
              aria-current={isCurrent ? "page" : undefined}
              className={cn(
                "group flex w-12 flex-col items-center gap-1 rounded-lg py-2 transition-colors",
                isViewed ? "bg-white/[0.06] text-white" : "text-slate-500 hover:bg-white/[0.03] hover:text-slate-200",
              )}
            >
              <Icon className={cn("h-[18px] w-[18px]", isCurrent && "text-brand-300")} />
              <span className="text-[9px] font-medium leading-none">{w.short}</span>
            </button>
          );
        })}
        {adminLink && <div className="mt-auto w-full px-1.5">{adminLink}</div>}
      </div>

      {/* Contextual panel */}
      <nav className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 py-3">
        <div className="px-2.5 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          {viewed.label}
        </div>
        {viewed.items.map((it) => (
          <ContextRow key={it.href} item={it} active={isActivePath(pathname, it.href)} />
        ))}
      </nav>
    </div>
  );
}

/**
 * Mobile drawer: full workspace map, each workspace as a labelled group. No rail
 * (touch targets win over density on small screens).
 */
export function NavLinks({ role = "owner" }: { role?: Role }) {
  const pathname = usePathname();
  const spaces = accessibleWorkspaces(role);
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3">
      {spaces.map((w) => (
        <div key={w.id}>
          <div className="flex items-center gap-2 px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            <w.icon className="h-3.5 w-3.5" />
            {w.label}
          </div>
          <div className="space-y-0.5">
            {w.items.map((it) => (
              <ContextRow key={it.href} item={it} active={isActivePath(pathname, it.href)} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
