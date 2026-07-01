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
  /** Connection-mode scope: "qr" pages hidden in Meta mode and vice-versa. */
  mode?: "qr" | "meta";
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
      { href: "/dashboard/testing-arena", label: "ساحة الاختبار", icon: Beaker, perm: "settings" },
      // CONSOLIDATED (duplicate nav): same feature as /dashboard/testing-arena — page still reachable by URL.
      // { href: "/dashboard/arena", label: "ساحة الاختبار ٢", icon: Beaker, perm: "settings" },
      { href: "/dashboard/ai-audit", label: "تدقيق الذكاء", icon: ShieldCheck, perm: "settings" },
      // CONSOLIDATED (duplicate nav): overlaps /dashboard/revenue-copilot ("مساعد الإيرادات") — page still reachable by URL.
      // { href: "/dashboard/revenue-pro", label: "مساعد الإيرادات Pro", icon: TrendingUp, perm: "analytics" },
      { href: "/dashboard/playground", label: "تجربة المحادثة", icon: FlaskConical, perm: "settings" },
      { href: "/dashboard/quick-replies", label: "الردود السريعة", icon: MessageSquare, perm: "settings" },
      // CONSOLIDATED (duplicate nav): same `smart_assistant` capability as /dashboard/knowledge-brain — page still reachable by URL.
      // { href: "/dashboard/brain", label: "مركز الدماغ", icon: Brain, perm: "settings" },
      // HIDDEN (final-polish): not production-ready — re-enable when the workflow is complete
      // { href: "/dashboard/agents", label: "نظام الوكلاء", icon: Users, perm: "settings" },
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
      // HIDDEN (final-polish): not production-ready — re-enable when flows actually execute
      // { href: "/dashboard/flow-builder", label: "منشئ المسارات", icon: Workflow, perm: "settings" },
      { href: "/dashboard/branches", label: "الفروع", icon: Building2, perm: "settings" },
      { href: "/dashboard/approvals", label: "الموافقات", icon: CheckSquare, perm: "team" },
      { href: "/dashboard/whatsapp", label: "ربط واتساب", icon: Phone, perm: "settings", mode: "qr" },
      { href: "/dashboard/whatsapp-health", label: "صحة جلسة واتساب", icon: Phone, perm: "settings", mode: "qr" },
      { href: "/dashboard/meta-health", label: "صحة اتصال Meta", icon: ShieldCheck, perm: "settings", mode: "meta" },
      { href: "/dashboard/meta", label: "مركز Meta والفوترة", icon: ShieldCheck, perm: "settings", mode: "meta" },
      // CONSOLIDATED (duplicate nav): synonym of /dashboard/intel ("الرصد الذكي") — page still reachable by URL.
      // { href: "/dashboard/monitoring", label: "الرصد الذكي Pro", icon: Activity, perm: "analytics" },
      { href: "/dashboard/ai-operations", label: "عمليات الذكاء", icon: Brain, perm: "settings" },
      { href: "/dashboard/qr-queue", label: "حجز جلسات QR", icon: CalendarClock, perm: "broadcasts" },
      { href: "/dashboard/escalations", label: "التصعيدات", icon: AlertTriangle, perm: "escalations" },
      { href: "/dashboard/safety", label: "الأمان", icon: ShieldAlert, perm: "settings" },
      { href: "/dashboard/compliance", label: "الامتثال والتسليم", icon: ShieldCheck, perm: "settings" },
      { href: "/dashboard/audit-log", label: "سجل التدقيق", icon: ScrollText, perm: "team" },
      { href: "/docs", label: "مركز المساعدة", icon: BookOpen, perm: "analytics" },
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
      // HIDDEN (final-polish): not production-ready — branding not yet applied at runtime
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

// Beginner mode: the essential destinations a non-technical owner needs daily.
// Everything else is "advanced" and hidden until the user flips to "كل الأدوات".
const CORE_HREFS = new Set<string>([
  "/dashboard",
  "/dashboard/orders", "/dashboard/products", "/dashboard/broadcasts",
  "/dashboard/customers", "/dashboard/inbox", "/dashboard/leads",
  "/dashboard/bot", "/dashboard/knowledge", "/dashboard/quick-replies",
  "/dashboard/whatsapp", "/docs",
  "/dashboard/settings", "/dashboard/billing", "/dashboard/wallet",
]);
const NAV_MODE_KEY = "keyone_nav_simple";

// Before a workspace is activated (no active subscription) the owner should see
// ONLY the get-started essentials — welcome, billing, plan, wallet, account.
// Every premium area (CRM, broadcasts, AI, QR, analytics, API, integrations,
// orders, customers…) stays hidden until they activate. Pure visibility — the
// backend capability gates enforce access independently.
const PRE_ACTIVATION_HREFS = new Set<string>([
  "/dashboard",
  "/dashboard/billing",
  "/dashboard/wallet",
  "/dashboard/plan",
  "/dashboard/usage",
  "/dashboard/settings",
]);

export type NavMode = "qr" | "meta";

export interface NavAccess {
  role: Role;
  activated: boolean;
  metaMode: NavMode;
  /** Whether plan capability gating is enforced for this principal (k_* plans). */
  enforce?: boolean;
  /** capabilityKey -> allowed (from getEntitlements). */
  caps?: Record<string, boolean>;
}

/**
 * Capability required to SEE each premium destination. Keys are the EXACT same
 * capability the page's pageGate() enforces, so the nav never shows a feature the
 * plan can't open (the page itself renders the upgrade CTA on direct URL access).
 * Derived from app/dashboard/<page>/page.tsx pageGate() calls.
 */
const NAV_CAP_BY_HREF: Record<string, string> = {
  "/dashboard/analytics": "advanced_analytics",
  "/dashboard/command-center": "advanced_analytics",
  "/dashboard/broadcasts": "broadcasts",
  "/dashboard/broadcasts-pro": "broadcasts",
  "/dashboard/leads": "lead_scoring",
  "/dashboard/knowledge": "knowledge_base",
  "/dashboard/knowledge-brain": "smart_assistant",
  "/dashboard/brain": "smart_assistant",
  "/dashboard/suggestions": "smart_assistant",
  "/dashboard/sales-brain": "sales_pipeline",
  "/dashboard/revenue-copilot": "revenue_attribution",
  "/dashboard/revenue-forecast": "revenue_attribution",
  "/dashboard/business-intelligence": "advanced_analytics",
  "/dashboard/intel": "advanced_insights",
  "/dashboard/funnel": "advanced_analytics",
  "/dashboard/segments": "customer_segmentation",
  "/dashboard/recovery": "smart_campaign_builder",
  "/dashboard/coupons": "smart_campaign_builder",
  "/dashboard/business": "advanced_reporting",
  "/dashboard/automations": "advanced_automations",
  "/dashboard/branches": "multi_branch",
  "/dashboard/approvals": "approval_workflows",
  "/dashboard/developer": "api_access",
  "/dashboard/working-hours": "working_hours",
};

/** Single source of truth for "can this principal see this nav destination". */
export function navItemVisible(i: NavItem, opts: NavAccess): boolean {
  if (!can(opts.role, i.perm)) return false;
  // Pre-activation: only the get-started essentials are visible.
  if (!opts.activated) return PRE_ACTIVATION_HREFS.has(i.href);
  // Meta merchants never see QR connection pages and vice-versa.
  if (i.mode === "qr" && opts.metaMode === "meta") return false;
  if (i.mode === "meta" && opts.metaMode === "qr") return false;
  // Per-plan feature visibility: hide what the plan doesn't own (k_* enforced).
  // The page's pageGate renders the upgrade CTA if reached by direct URL.
  if (opts.enforce && opts.caps) {
    const cap = NAV_CAP_BY_HREF[i.href];
    if (cap && !opts.caps[cap]) return false;
  }
  return true;
}

/** Flat list of destinations the principal may reach — used by the command palette. */
export function visibleNavItems(role: Role, opts: Omit<NavAccess, "role">): NavItem[] {
  return NAV_ITEMS.filter((i) => navItemVisible(i, { role, ...opts }));
}

function accessibleWorkspaces(role: Role, simple = false, pathname = "", access: Omit<NavAccess, "role"> = { activated: true, metaMode: "qr" }): Workspace[] {
  return WORKSPACES.map((w) => ({
    ...w,
    items: w.items.filter((i) => {
      if (!navItemVisible(i, { role, ...access })) return false;
      if (!access.activated) return true; // pre-activation set already minimal
      // In simple mode keep only core items — plus whatever page you're on, so the
      // nav always answers "where am I?" even on an advanced screen.
      return !simple || CORE_HREFS.has(i.href) || isActivePath(pathname, i.href);
    }),
  })).filter((w) => w.items.length > 0);
}

function useNavMode(): [boolean, () => void] {
  const [simple, setSimple] = useState(true);
  useEffect(() => { try { setSimple(localStorage.getItem(NAV_MODE_KEY) !== "0"); } catch {} }, []);
  const toggle = () => setSimple((v) => { const n = !v; try { localStorage.setItem(NAV_MODE_KEY, n ? "1" : "0"); } catch {} return n; });
  return [simple, toggle];
}

function NavModeToggle({ simple, toggle }: { simple: boolean; toggle: () => void }) {
  return (
    <button onClick={toggle} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2 text-[11px] text-slate-400 hover:bg-white/[0.05] hover:text-slate-200">
      {simple ? "⚙ عرض كل الأدوات" : "↩ الأساسيات فقط"}
    </button>
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
export function SidebarNav({ adminLink, role = "owner", activated = true, metaMode = "qr", enforce = false, caps }: { adminLink?: React.ReactNode; role?: Role; activated?: boolean; metaMode?: NavMode; enforce?: boolean; caps?: Record<string, boolean> }) {
  const pathname = usePathname();
  const [simple, toggleMode] = useNavMode();
  const spaces = accessibleWorkspaces(role, simple, pathname, { activated, metaMode, enforce, caps });
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
        {activated && <NavModeToggle simple={simple} toggle={toggleMode} />}
      </nav>
    </div>
  );
}

/**
 * Mobile drawer: full workspace map, each workspace as a labelled group. No rail
 * (touch targets win over density on small screens).
 */
export function NavLinks({ role = "owner", activated = true, metaMode = "qr", enforce = false, caps }: { role?: Role; activated?: boolean; metaMode?: NavMode; enforce?: boolean; caps?: Record<string, boolean> }) {
  const pathname = usePathname();
  const [simple, toggleMode] = useNavMode();
  const spaces = accessibleWorkspaces(role, simple, pathname, { activated, metaMode, enforce, caps });
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
      {activated && <NavModeToggle simple={simple} toggle={toggleMode} />}
    </nav>
  );
}
