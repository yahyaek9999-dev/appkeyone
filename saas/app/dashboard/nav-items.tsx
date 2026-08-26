"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { can, type Permission, type Role } from "@/lib/rbac";
import type { ModuleKey } from "@/lib/modules";
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
  ClipboardList,
  GitBranch,
  MessageCircle,
  Lock,
  Sliders,
  CreditCard,
  Gamepad2,
  Cpu,
  Play,
  Eye,
  Sparkles,
  type LucideIcon,
  Truck,
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
  // ── 1. الرئيسية ───────────────────────────────────────────────────────────
  {
    id: "home",
    label: "الرئيسية",
    short: "الرئيسية",
    icon: LayoutDashboard,
    home: "/dashboard",
    items: [
      { href: "/dashboard", label: "نظرة عامة", icon: LayoutDashboard, perm: "analytics" },
      { href: "/dashboard/my-work", label: "عملي اليوم", icon: ClipboardList, perm: "inbox" },
      { href: "/dashboard/plan", label: "لوحة الباقة", icon: Briefcase, perm: "analytics" },
    ],
  },

  // ── 2. المحادثات ──────────────────────────────────────────────────────────
  {
    id: "conversations",
    label: "المحادثات",
    short: "المحادثات",
    icon: Inbox,
    home: "/dashboard/inbox",
    items: [
      { href: "/dashboard/inbox", label: "صندوق المحادثات", icon: Inbox, perm: "inbox" },
      { href: "/dashboard/escalations", label: "التصعيدات", icon: AlertTriangle, perm: "escalations" },
      { href: "/dashboard/quick-replies", label: "الردود السريعة", icon: MessageSquare, perm: "settings" },
      { href: "/dashboard/settings/numbers", label: "أرقام واتساب", icon: Phone, perm: "settings" },
      { href: "/dashboard/meta-health", label: "حالة الاتصال", icon: Activity, perm: "settings", mode: "meta" },
      // QR-mode counterpart to meta-health, so every tenant has exactly one
      // connection-health destination. whatsapp_health is a minTierIndex 0
      // capability — every paying customer buys it — but its only nav entry
      // used to live in ADMIN_WORKSPACE, so no customer could reach it.
      { href: "/dashboard/whatsapp-health", label: "صحة جلسة واتساب", icon: Activity, perm: "settings", mode: "qr" },
      { href: "/dashboard/compliance", label: "الامتثال والتسليم", icon: ShieldCheck, perm: "settings" },
    ],
  },

  // ── 3. العملاء ────────────────────────────────────────────────────────────
  {
    id: "customers",
    label: "العملاء",
    short: "العملاء",
    icon: Users,
    home: "/dashboard/customers",
    items: [
      { href: "/dashboard/customers", label: "كل العملاء", icon: Users, perm: "customers" },
      { href: "/dashboard/leads", label: "العملاء المحتملون", icon: Zap, perm: "customers" },
      { href: "/dashboard/segments", label: "الشرائح", icon: Layers, perm: "analytics" },
      { href: "/dashboard/import", label: "استيراد العملاء", icon: Download, perm: "customers" },
    ],
  },

  // ── 4. المبيعات ───────────────────────────────────────────────────────────
  {
    id: "sales",
    label: "المبيعات",
    short: "المبيعات",
    icon: Briefcase,
    home: "/dashboard/orders",
    items: [
      { href: "/dashboard/orders", label: "الطلبات", icon: ShoppingBag, perm: "customers" },
      { href: "/dashboard/products", label: "المنتجات", icon: Package, perm: "settings" },
      { href: "/dashboard/coupons", label: "الكوبونات", icon: Ticket, perm: "settings" },
      { href: "/dashboard/shipments", label: "الشحن والتتبّع", icon: Truck, perm: "customers" },
    ],
  },

  // ── 5. التسويق ────────────────────────────────────────────────────────────
  {
    id: "marketing",
    label: "التسويق",
    short: "التسويق",
    icon: Rocket,
    home: "/dashboard/broadcasts-pro",
    items: [
      { href: "/dashboard/broadcasts-pro", label: "الحملات", icon: Send, perm: "broadcasts" },
      { href: "/dashboard/broadcasts", label: "حملات البثّ (متقدمة)", icon: Send, perm: "broadcasts" },
      { href: "/dashboard/recovery", label: "استعادة العملاء", icon: RotateCcw, perm: "broadcasts" },
      { href: "/dashboard/sms", label: "رسائل SMS", icon: MessageCircle, perm: "settings" },
    ],
  },

  // ── 6. الأتمتة ────────────────────────────────────────────────────────────
  {
    id: "automation",
    label: "الأتمتة",
    short: "الأتمتة",
    icon: Zap,
    home: "/dashboard/bot",
    items: [
      { href: "/dashboard/bot", label: "الردود التلقائية", icon: Bot, perm: "settings" },
      { href: "/dashboard/bot-builder", label: "منشئ المحادثات", icon: GitBranch, perm: "settings" },
      { href: "/dashboard/automations", label: "قواعد الأتمتة", icon: Zap, perm: "settings" },
      { href: "/dashboard/knowledge", label: "قاعدة المعرفة", icon: BookOpen, perm: "settings" },
      { href: "/dashboard/knowledge-brain", label: "ذاكرة المعرفة", icon: Brain, perm: "settings" },
      { href: "/dashboard/working-hours", label: "ساعات العمل", icon: CalendarClock, perm: "settings" },
      { href: "/dashboard/flow-builder", label: "منشئ تدفقات البيانات", icon: Workflow, perm: "settings" },
      { href: "/dashboard/agents", label: "المساعدات الذكية", icon: Brain, perm: "settings" },
      { href: "/dashboard/ai-operations", label: "عمليات الذكاء الاصطناعي", icon: Lightbulb, perm: "settings" },
      { href: "/dashboard/ai-audit", label: "مراجعة جاهزية المساعد", icon: Beaker, perm: "settings" },
      { href: "/dashboard/brain", label: "مركز البيانات", icon: Brain, perm: "settings" },
    ],
  },

  // ── 7. التحليلات ──────────────────────────────────────────────────────────
  {
    id: "analytics",
    label: "التحليلات",
    short: "التحليلات",
    icon: BarChart3,
    home: "/dashboard/analytics",
    items: [
      { href: "/dashboard/analytics", label: "نظرة عامة", icon: BarChart3, perm: "analytics" },
      { href: "/dashboard/business-intelligence", label: "ذكاء الأعمال", icon: PieChart, perm: "analytics" },
      { href: "/dashboard/funnel", label: "قمع التحويل", icon: Filter, perm: "analytics" },
      { href: "/dashboard/revenue-copilot", label: "فرص الإيرادات", icon: TrendingUp, perm: "analytics" },
      { href: "/dashboard/revenue-forecast", label: "توقّع الإيرادات", icon: TrendingUp, perm: "analytics" },
      { href: "/dashboard/business", label: "أداء النشاط", icon: Building2, perm: "analytics" },
      { href: "/dashboard/revenue-pro", label: "تحليلات الإيرادات المتقدمة", icon: TrendingUp, perm: "analytics" },
      { href: "/dashboard/sales-brain", label: "ذكاء المبيعات", icon: Brain, perm: "analytics" },
      { href: "/dashboard/suggestions", label: "الاقتراحات", icon: Lightbulb, perm: "analytics" },
      { href: "/dashboard/monitoring", label: "مركز الرصد", icon: Activity, perm: "analytics" },
      { href: "/dashboard/export", label: "تصدير البيانات", icon: Download, perm: "customers" },
    ],
  },

  // ── 8. الإعدادات ──────────────────────────────────────────────────────────
  {
    id: "settings",
    label: "الإعدادات",
    short: "الإعدادات",
    icon: Settings,
    home: "/dashboard/settings",
    items: [
      { href: "/dashboard/settings", label: "الحساب والنشاط", icon: Settings, perm: "analytics" },
      { href: "/dashboard/billing", label: "الاشتراك والدفع", icon: CreditCard, perm: "billing" },
      { href: "/dashboard/usage", label: "الباقة والاستخدام", icon: Crown, perm: "analytics" },
      { href: "/dashboard/wallet", label: "المحفظة والرصيد", icon: Wallet, perm: "billing" },
      { href: "/dashboard/settings/providers", label: "المزوّدون", icon: Plug, perm: "settings" },
      { href: "/dashboard/integrations", label: "التكاملات", icon: Plug, perm: "settings" },
      { href: "/dashboard/branches", label: "الفروع", icon: Building2, perm: "settings" },
      { href: "/dashboard/approvals", label: "الموافقات", icon: CheckSquare, perm: "team" },
      { href: "/dashboard/audit-log", label: "سجل النشاط", icon: ScrollText, perm: "team" },
      { href: "/dashboard/system-health", label: "صحة النظام", icon: Activity, perm: "settings" },
      { href: "/dashboard/safety", label: "لوحة السلامة والحماية", icon: ShieldAlert, perm: "settings" },
      { href: "/dashboard/white-label", label: "العلامة البيضاء", icon: Palette, perm: "settings" },
      { href: "/dashboard/developer", label: "مركز المطوّرين", icon: Code2, perm: "settings" },
      { href: "/docs", label: "مركز المساعدة", icon: BookOpen, perm: "analytics" },
    ],
  },
];

/**
 * Destinations intentionally NOT in customer navigation.
 *
 * The POLICY, not a list — an enumerated list drifted badly here once and went
 * on describing `ai-operations`, `compliance`, `revenue-forecast`, `revenue-pro`,
 * `broadcasts`, `flow-builder`, `agents` and `white-label` as hidden long after
 * all eight had been added to the customer sidebar.
 *
 * A destination belongs in ADMIN_WORKSPACE and nowhere else when EITHER:
 *
 *   1. its page calls requireAdmin() — platform-operator tooling that would
 *      bounce a customer to /dashboard (arena, playground, testing-arena, demo,
 *      qr-queue, feature-center, memberships), or
 *   2. it is an operator console with no customer meaning (command-center,
 *      intel, brain, knowledge-brain, sales-brain, monitoring, suggestions) or a
 *      legacy alias kept only for support (whatsapp, meta, plan).
 *
 * The inverse is the rule that matters: a page built with pageGate() +
 * <LockedFeature> IS a customer surface and MUST have a customer nav entry.
 * whatsapp_health (minTierIndex 0), safety_controls and ai_audit each sat only
 * in ADMIN_WORKSPACE while being sold to customers, so nobody who paid for them
 * could find them. Being un-entitled is never a reason to omit the entry —
 * navItemLocked() renders the lock and the upgrade path.
 *
 * Everything here stays reachable by direct URL for support; it is simply not
 * advertised in the sidebar or the ⌘K palette.
 */

/** Platform-admin-only workspace — ALL 59 existing real/internal product pages visible to admin. */
const ADMIN_WORKSPACE: Workspace = {
  id: "platform_admin",
  label: "Platform Admin",
  short: "Admin",
  icon: Sliders,
  home: "/dashboard/feature-center",
  items: [
    // Hidden root item to ensure workspaceForPath recognizes /dashboard as admin
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "billing" },
    // ── Platform Control ──────────────────────────────────────────────────────
    { href: "/dashboard/feature-center", label: "Feature Center", icon: Sliders, perm: "billing" },
    { href: "/admin/feature-control", label: "Feature Control", icon: Sliders, perm: "billing" },
    { href: "/admin/memberships", label: "Memberships", icon: CreditCard, perm: "billing" },
    { href: "/dashboard/memberships", label: "Memberships Matrix", icon: CreditCard, perm: "billing" },

    // ── Messaging & Inbox ─────────────────────────────────────────────────────
    { href: "/dashboard/inbox", label: "Inbox", icon: Inbox, perm: "billing" },
    { href: "/dashboard/quick-replies", label: "Quick Replies", icon: MessageSquare, perm: "billing" },
    { href: "/dashboard/escalations", label: "Escalations", icon: AlertTriangle, perm: "billing" },
    { href: "/dashboard/whatsapp-health", label: "WhatsApp Health", icon: Activity, perm: "billing" },
    { href: "/dashboard/meta-health", label: "Meta Health", icon: Activity, perm: "billing" },
    { href: "/dashboard/whatsapp", label: "WhatsApp (Legacy)", icon: Phone, perm: "billing" },
    { href: "/dashboard/meta", label: "Meta (Legacy)", icon: CreditCard, perm: "billing" },

    // ── Customers & Segmentation ──────────────────────────────────────────────
    { href: "/dashboard/customers", label: "Customers", icon: Users, perm: "billing" },
    { href: "/dashboard/leads", label: "Leads", icon: Zap, perm: "billing" },
    { href: "/dashboard/segments", label: "Segments", icon: Layers, perm: "billing" },
    { href: "/dashboard/import", label: "Customer Import", icon: Download, perm: "billing" },

    // ── Sales & Commerce ──────────────────────────────────────────────────────
    { href: "/dashboard/orders", label: "Orders", icon: ShoppingBag, perm: "billing" },
    { href: "/dashboard/products", label: "Products", icon: Package, perm: "billing" },
    { href: "/dashboard/coupons", label: "Coupons", icon: Ticket, perm: "billing" },
    { href: "/dashboard/shipments", label: "Shipments", icon: Truck, perm: "billing" },

    // ── Marketing & Growth ────────────────────────────────────────────────────
    { href: "/dashboard/broadcasts-pro", label: "Broadcasts (QR)", icon: Send, perm: "billing" },
    { href: "/dashboard/broadcasts", label: "Broadcasts (Classic)", icon: Send, perm: "billing" },
    { href: "/dashboard/recovery", label: "Recovery", icon: RotateCcw, perm: "billing" },
    { href: "/dashboard/qr-queue", label: "QR Queue", icon: CalendarClock, perm: "billing" },
    { href: "/dashboard/sms", label: "SMS", icon: MessageCircle, perm: "billing" },

    // ── Automation & AI ───────────────────────────────────────────────────────
    { href: "/dashboard/bot", label: "Bot Configuration", icon: Bot, perm: "billing" },
    { href: "/dashboard/bot-builder", label: "Bot Builder", icon: GitBranch, perm: "billing" },
    { href: "/dashboard/automations", label: "Automations", icon: Zap, perm: "billing" },
    { href: "/dashboard/flow-builder", label: "Flow Builder", icon: Workflow, perm: "billing" },
    { href: "/dashboard/agents", label: "AI Agents", icon: Brain, perm: "billing" },
    { href: "/dashboard/ai-operations", label: "AI Operations", icon: Lightbulb, perm: "billing" },
    { href: "/dashboard/knowledge", label: "Knowledge Base", icon: BookOpen, perm: "billing" },
    { href: "/dashboard/working-hours", label: "Working Hours", icon: CalendarClock, perm: "billing" },

    // ── Analytics & Revenue ───────────────────────────────────────────────────
    { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3, perm: "billing" },
    { href: "/dashboard/business-intelligence", label: "Business Intelligence", icon: PieChart, perm: "billing" },
    { href: "/dashboard/funnel", label: "Funnel", icon: Filter, perm: "billing" },
    { href: "/dashboard/revenue-copilot", label: "Revenue Copilot", icon: TrendingUp, perm: "billing" },
    { href: "/dashboard/revenue-forecast", label: "Revenue Forecast", icon: TrendingUp, perm: "billing" },
    { href: "/dashboard/revenue-pro", label: "Revenue Pro", icon: TrendingUp, perm: "billing" },
    { href: "/dashboard/business", label: "Business Performance", icon: Building2, perm: "billing" },
    { href: "/dashboard/plan", label: "Plan", icon: CreditCard, perm: "billing" },

    // ── Account & Settings ────────────────────────────────────────────────────
    { href: "/dashboard/settings", label: "Settings", icon: Settings, perm: "billing" },
    { href: "/dashboard/billing", label: "Billing", icon: CreditCard, perm: "billing" },
    { href: "/dashboard/usage", label: "Usage", icon: Crown, perm: "billing" },
    { href: "/dashboard/wallet", label: "Wallet", icon: Wallet, perm: "billing" },
    { href: "/dashboard/integrations", label: "Integrations", icon: Plug, perm: "billing" },
    { href: "/dashboard/developer", label: "Developer", icon: Code2, perm: "billing" },
    { href: "/dashboard/branches", label: "Branches", icon: Building2, perm: "billing" },
    { href: "/dashboard/approvals", label: "Approvals", icon: CheckSquare, perm: "billing" },
    { href: "/dashboard/export", label: "Export", icon: Download, perm: "billing" },

    // ── Monitoring & Internal ─────────────────────────────────────────────────
    { href: "/dashboard/audit-log", label: "Audit Log", icon: ScrollText, perm: "billing" },
    { href: "/dashboard/system-health", label: "System Health", icon: Activity, perm: "billing" },
    { href: "/dashboard/command-center", label: "Command Center", icon: Sliders, perm: "billing" },
    { href: "/dashboard/intel", label: "Intel", icon: Activity, perm: "billing" },
    { href: "/dashboard/safety", label: "Safety", icon: ShieldAlert, perm: "billing" },
    { href: "/dashboard/compliance", label: "Compliance", icon: ShieldCheck, perm: "billing" },
    { href: "/dashboard/white-label", label: "White Label", icon: Palette, perm: "billing" },
    { href: "/dashboard/my-work", label: "My Work", icon: ClipboardList, perm: "billing" },

    // ── QA & Debugging (Optional) ─────────────────────────────────────────────
    { href: "/dashboard/testing-arena", label: "Testing Arena", icon: FlaskConical, perm: "billing" },
    { href: "/dashboard/playground", label: "Playground", icon: Beaker, perm: "billing" },
    { href: "/dashboard/ai-audit", label: "AI Audit", icon: Gauge, perm: "billing" },
    { href: "/dashboard/demo", label: "Demo", icon: Database, perm: "billing" },
    { href: "/dashboard/arena", label: "Arena", icon: FlaskConical, perm: "billing" },
  ],
};

// ── Back-compat exports ───────────────────────────────────────────────────────
// Older callers (command palette, mobile header label) consume a flat list and a
// {title, items} section list. Derive both from WORKSPACES so there is a single
// source of truth.
export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = WORKSPACES.map(
  (w) => ({ title: w.label, items: w.items }),
);
export const NAV_ITEMS: NavItem[] = WORKSPACES.flatMap((w) => w.items);

function workspaceForPath(pathname: string, allSpaces?: Workspace[]): Workspace {
  const search = allSpaces ?? WORKSPACES;
  let best: { ws: Workspace; len: number } | null = null;
  for (const ws of search) {
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
  "/dashboard/my-work",
  // المحادثات
  "/dashboard/inbox", "/dashboard/quick-replies", "/dashboard/settings/numbers",
  // العملاء
  "/dashboard/customers", "/dashboard/leads",
  // المبيعات
  "/dashboard/orders", "/dashboard/products",
  // التسويق
  "/dashboard/broadcasts-pro",
  // الأتمتة
  "/dashboard/bot", "/dashboard/knowledge",
  // التحليلات
  "/dashboard/analytics",
  // الإعدادات
  "/dashboard/settings", "/dashboard/billing", "/dashboard/usage", "/docs",
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
  /** Workspace module toggles (Business Type). moduleKey -> enabled. undefined = all on. */
  modules?: Partial<Record<ModuleKey, boolean>>;
  /**
   * Set of featureIds where customerVisible=false in FeatureControl.
   * Admin users pass undefined (bypass) — all features visible to admin.
   * Regular customers pass the loaded set — hides admin-disabled features.
   */
  disabledFeatures?: Set<string>;
}

/**
 * Href → canonical featureId from master-feature-registry.json.
 * Used to check FeatureControl.customerVisible before showing a nav item.
 * Only customer-facing routes need entries here. Admin routes are irrelevant.
 */
export const NAV_FEATURE_BY_HREF: Record<string, string> = {
  "/dashboard":                      "inbox",
  "/dashboard/inbox":                "inbox",
  "/dashboard/escalations":          "escalations",
  "/dashboard/quick-replies":        "quick_replies",
  "/dashboard/my-work":              "my_work",
  "/dashboard/customers":            "customer_management",
  "/dashboard/leads":                "lead_scoring",
  "/dashboard/segments":             "segments",
  "/dashboard/import":               "customer_import",
  "/dashboard/orders":               "order_management",
  "/dashboard/products":             "products",
  "/dashboard/coupons":              "coupons_discounts",
  "/dashboard/shipments":            "shipping_tracking",
  "/dashboard/broadcasts-pro":       "broadcast_credits",
  "/dashboard/broadcasts":           "broadcasts",
  "/dashboard/recovery":             "recovery",
  "/dashboard/qr-queue":             "qr_broadcast_queue",
  "/dashboard/sms":                  "sms_messaging",
  "/dashboard/bot":                  "bot_configuration",
  "/dashboard/bot-builder":          "flow_builder",
  "/dashboard/automations":          "advanced_automations",
  "/dashboard/knowledge":            "knowledge_base",
  "/dashboard/working-hours":        "working_hours",
  "/dashboard/flow-builder":         "flow_builder",
  "/dashboard/agents":               "smart_assistant",
  "/dashboard/analytics":            "basic_analytics",
  "/dashboard/business-intelligence":"advanced_analytics",
  "/dashboard/funnel":               "funnel_analytics",
  "/dashboard/revenue-copilot":      "revenue_copilot",
  "/dashboard/business":             "business_performance",
  "/dashboard/revenue-pro":          "revenue_pro",
  "/dashboard/export":               "data_export",
  "/dashboard/wallet":               "wallet",
  "/dashboard/billing":              "wallet",
  "/dashboard/integrations":         "integrations",
  "/dashboard/developer":            "api_access",
  "/dashboard/branches":             "multi_branch",
  "/dashboard/approvals":            "approval_workflows",
  "/dashboard/audit-log":            "audit_log",
  "/dashboard/white-label":          "white_label",
  "/dashboard/settings/numbers":     "multi_whatsapp",
  "/dashboard/settings/providers":   "integrations",
  "/dashboard/settings/team":        "team",
  "/dashboard/settings/ai-provider": "knowledge_base",
  "/dashboard/settings/meta-cloud":  "meta_cloud",
  "/dashboard/settings/bridge":      "whatsapp_connection",
  "/dashboard/ai-operations":        "ai_operations",
  "/dashboard/whatsapp-health":      "whatsapp_health",
  "/dashboard/meta":                 "meta_cloud",
  "/dashboard/meta-health":          "meta_cloud",
  "/dashboard/safety":               "safety_controls",
  "/dashboard/compliance":           "compliance_monitoring",
  "/dashboard/system-health":        "system_health",
  "/dashboard/settings":             "wallet",
  "/dashboard/usage":                "wallet",
  "/dashboard/revenue-forecast":     "forecasting",
  // Internal/QA routes — mapped for navigation gating
  "/dashboard/playground":           "playground",
  "/dashboard/ai-audit":             "ai_audit",
  "/dashboard/testing-arena":        "testing_arena",
  "/dashboard/arena":                "arena",
  "/dashboard/command-center":       "command_center",
  "/dashboard/intel":                "system_intelligence",
  "/dashboard/brain":                "brain",
  "/dashboard/knowledge-brain":      "knowledge_brain",
  "/dashboard/sales-brain":          "sales_brain",
  "/dashboard/demo":                 "demo",
  "/dashboard/monitoring":           "monitoring",
  "/dashboard/feature-center":       "feature_center",
  "/dashboard/memberships":          "memberships",
  "/dashboard/suggestions":          "suggestions",
};

/**
 * Destination → workspace MODULE. When a tenant disables a module (by Business
 * Type default or explicit toggle) every destination mapped here disappears from
 * the sidebar, mobile drawer, and ⌘K palette at once. Only commerce/vertical
 * destinations are mapped — core comms (customers, inbox), AI, settings, billing,
 * wallet and ops are never module-gated. Orthogonal to plan enforcement.
 */
const NAV_MODULE_BY_HREF: Record<string, ModuleKey> = {
  "/dashboard/products": "products",
  "/dashboard/orders": "orders",
  "/dashboard/broadcasts-pro": "broadcasts",
  "/dashboard/broadcasts": "broadcasts",
  "/dashboard/recovery": "broadcasts",
  "/dashboard/coupons": "broadcasts",
  "/dashboard/leads": "crm",
  "/dashboard/segments": "crm",
  "/dashboard/funnel": "crm",
  "/dashboard/branches": "branches",
  "/dashboard/business-intelligence": "reports",
  "/dashboard/business": "reports",
};

/**
 * Capability required to SEE each premium destination. Keys are the EXACT same
 * capability the page's pageGate() enforces, so the nav never shows a feature the
 * plan can't open (the page itself renders the upgrade CTA on direct URL access).
 * Derived from app/dashboard/<page>/page.tsx pageGate() calls.
 */
export const NAV_CAP_BY_HREF: Record<string, string> = {
  "/dashboard/analytics": "advanced_analytics",
  "/dashboard/command-center": "advanced_analytics",
  "/dashboard/broadcasts": "broadcasts",
  "/dashboard/leads": "lead_scoring",
  "/dashboard/knowledge": "knowledge_base",
  "/dashboard/bot-builder": "flow_builder",
  "/dashboard/flow-builder": "flow_builder",
  "/dashboard/agents": "smart_assistant",
  "/dashboard/white-label": "white_label",
  "/dashboard/knowledge-brain": "smart_assistant",
  "/dashboard/brain": "smart_assistant",
  "/dashboard/suggestions": "smart_assistant",
  "/dashboard/sales-brain": "sales_pipeline",
  "/dashboard/revenue-copilot": "revenue_copilot",
  "/dashboard/revenue-forecast": "forecasting",
  "/dashboard/business-intelligence": "advanced_analytics",
  "/dashboard/intel": "advanced_insights",
  "/dashboard/funnel": "advanced_analytics",
  // Gate on the tier-1 capability each page actually sells. These previously
  // pointed at tier-2 keys, hiding Growth-plan features from Growth customers.
  "/dashboard/segments": "segments",
  "/dashboard/recovery": "recovery",
  "/dashboard/coupons": "coupons_discounts",
  "/dashboard/shipments": "shipping_tracking",
  "/dashboard/business": "advanced_reporting",
  "/dashboard/automations": "advanced_automations",
  "/dashboard/branches": "multi_branch",
  "/dashboard/approvals": "approval_workflows",
  "/dashboard/developer": "api_access",
  "/dashboard/working-hours": "working_hours",
  "/dashboard/settings/numbers": "multi_whatsapp",
  // Capabilities added in catalog expansion (catalog.ts)
  "/dashboard/ai-audit": "smart_assistant",
  "/dashboard/my-work": "my_work",
  "/dashboard/products": "products",
  "/dashboard/wallet": "wallet",
  "/dashboard/escalations": "escalations",
  "/dashboard/audit-log": "audit_log",
  "/dashboard/import": "customer_import",
  "/dashboard/broadcasts-pro": "broadcast_credits",
  "/dashboard/monitoring": "monitoring_center",
  "/dashboard/compliance": "compliance_monitoring",
  "/dashboard/meta": "meta_cloud",
  "/dashboard/revenue-pro": "revenue_pro",
  "/dashboard/safety": "safety_controls",
  "/dashboard/bot": "bot_configuration",
  "/dashboard/whatsapp-health": "whatsapp_health",
  "/dashboard/ai-operations": "ai_operations",
  "/dashboard/system-health": "system_health",
};

/** Single source of truth for "can this principal see this nav destination". */
export function navItemVisible(i: NavItem, opts: NavAccess): boolean {
  if (!can(opts.role, i.perm)) return false;
  // Pre-activation: only the get-started essentials are visible.
  if (!opts.activated) return PRE_ACTIVATION_HREFS.has(i.href);
  // Meta merchants never see QR connection pages and vice-versa.
  if (i.mode === "qr" && opts.metaMode === "meta") return false;
  if (i.mode === "meta" && opts.metaMode === "qr") return false;
  // Workspace module gating (Business Type): hide destinations whose module the
  // tenant disabled. Orthogonal to plan enforcement — applies to ALL tenants.
  if (opts.modules) {
    const mod = NAV_MODULE_BY_HREF[i.href];
    if (mod && opts.modules[mod] === false) return false;
  }
  // FeatureControl.customerVisible gate: admin can disable customer visibility of
  // any feature from Feature Center. disabledFeatures is undefined for admin
  // principals (who bypass this gate entirely).
  if (opts.disabledFeatures) {
    const fid = NAV_FEATURE_BY_HREF[i.href];
    if (fid && opts.disabledFeatures.has(fid)) return false;
  }
  return true;
}

/** True when the nav item exists but the user's plan doesn't include it. */
export function navItemLocked(i: NavItem, opts: NavAccess): boolean {
  if (!opts.enforce || !opts.caps) return false;
  const cap = NAV_CAP_BY_HREF[i.href];
  return !!cap && !opts.caps[cap];
}

/** Flat list of destinations the principal may reach — used by the command palette. */
export function visibleNavItems(role: Role, opts: Omit<NavAccess, "role">): NavItem[] {
  return NAV_ITEMS.filter((i) => navItemVisible(i, { role, ...opts }));
}

function accessibleWorkspaces(role: Role, simple = false, pathname = "", access: Omit<NavAccess, "role"> = { activated: true, metaMode: "qr" }): Workspace[] {
  return WORKSPACES.map((w) => ({
    ...w,
    items: w.items.filter((i) => {
      // Items hidden by role/mode/module/customerVisible are never shown.
      if (!navItemVisible(i, { role, ...access })) return false;
      if (!access.activated) return true;
      // Plan-locked items are STILL shown — rendered with a lock + upgrade CTA
      // by ContextRow. Entitlement decides how a destination looks, never
      // whether it exists: the compact/expanded density rule below is applied
      // identically to locked and unlocked items so nothing ever disappears
      // merely because of the customer's tier.
      return !simple || CORE_HREFS.has(i.href) || isActivePath(pathname, i.href);
    }),
  })).filter((w) => w.items.length > 0);
}

/**
 * Nav density preference. DISCOVERY-FIRST DEFAULT: a principal who has never
 * expressed a preference sees every destination they may reach.
 *
 * This used to default to compact (`getItem(key) !== "0"` — and an untouched
 * key is null, so everyone started compact). The effect was that a paying
 * customer's first sight of the product was 17 of 48 destinations, with 30
 * fully-entitled features suppressed by a density filter they never chose.
 * Beginner mode is a deliberate choice, not a starting state.
 *
 * Only an explicit stored "1" means compact, so anyone who actually picked
 * "الأساسيات فقط" keeps it, and an explicit "0" keeps expanded.
 */
function useNavMode(): [boolean, () => void] {
  const [simple, setSimple] = useState(false);
  useEffect(() => { try { setSimple(localStorage.getItem(NAV_MODE_KEY) === "1"); } catch {} }, []);
  const toggle = () => setSimple((v) => { const n = !v; try { localStorage.setItem(NAV_MODE_KEY, n ? "1" : "0"); } catch {} return n; });
  return [simple, toggle];
}

function NavModeToggle({ simple, toggle }: { simple: boolean; toggle: () => void }) {
  return (
    <button
      onClick={toggle}
      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.015] px-2 py-2 text-[11px] font-medium text-slate-500 transition-all duration-150 hover:border-white/[0.10] hover:bg-white/[0.04] hover:text-slate-300"
    >
      {simple ? "عرض كل الأدوات" : "الأساسيات فقط"}
    </button>
  );
}

function ContextRow({ item, active, locked = false }: { item: NavItem; active: boolean; locked?: boolean }) {
  const Icon = item.icon;
  if (locked) {
    return (
      <Link
        href={item.href}
        className="sidebar-link relative opacity-50 hover:opacity-70 transition-opacity"
        title="ترقية الباقة للوصول"
      >
        <Icon className="h-[18px] w-[18px] shrink-0 text-slate-600" />
        <span className="flex-1 truncate text-slate-600">{item.label}</span>
        <Lock className="h-3 w-3 shrink-0 text-slate-700" />
      </Link>
    );
  }
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
export function SidebarNav({ adminLink, role = "owner", activated = true, metaMode = "qr", enforce = false, caps, modules, isPlatformAdmin = false, disabledFeatures }: { adminLink?: React.ReactNode; role?: Role; activated?: boolean; metaMode?: NavMode; enforce?: boolean; caps?: Record<string, boolean>; modules?: Partial<Record<ModuleKey, boolean>>; isPlatformAdmin?: boolean; disabledFeatures?: Set<string> }) {
  const pathname = usePathname();
  const [_simple, toggleMode] = useNavMode();
  // Nav DENSITY is a user preference, never a function of the plan. This was
  // `enforce ? _simple : false`, which keyed density off an ENTITLEMENT flag:
  // enforced k_* customers got the compact nav while legacy/unenforced tenants
  // always got the full one — so the paying customer saw fewer of their own
  // features. Platform admins keep the always-full nav (they also carry
  // ADMIN_WORKSPACE); everyone else gets their own preference.
  const simple = isPlatformAdmin ? false : _simple;
  const baseSpaces = accessibleWorkspaces(role, simple, pathname, { activated, metaMode, enforce, caps, modules, disabledFeatures });
  const spaces = isPlatformAdmin ? [...baseSpaces, ADMIN_WORKSPACE] : baseSpaces;
  const currentWs = workspaceForPath(pathname, spaces);
  // Which workspace's items are shown in the panel. Defaults to the one holding
  // the current route; the user can preview another by clicking its rail glyph.
  const [viewId, setViewId] = useState(currentWs.id);
  useEffect(() => setViewId(currentWs.id), [currentWs.id]);

  const viewed = spaces.find((w) => w.id === viewId) ?? spaces[0];
  const accessOpts: Omit<NavAccess, "role"> = { activated, metaMode, enforce, caps, modules, disabledFeatures };

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
                "group relative flex w-12 flex-col items-center gap-1 rounded-xl py-2.5 transition-all duration-150",
                isViewed
                  ? "bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-200",
              )}
            >
              {/* Active workspace indicator dot */}
              {isCurrent && (
                <span className="absolute end-1.5 top-1.5 h-1 w-1 rounded-full bg-brand-400 shadow-[0_0_4px_rgba(47,147,132,0.8)]" />
              )}
              <Icon className={cn("h-[18px] w-[18px] transition-colors", isCurrent ? "text-brand-300" : "")} />
              <span className={cn("text-[9px] font-medium leading-none transition-colors", isCurrent ? "text-brand-300" : "")}>{w.short}</span>
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
        {(() => {
          // Platform admin workspace must show ALL items without filtering
          const itemsToRender = viewed.id === "platform_admin" ? ADMIN_WORKSPACE.items : viewed.items;
          return itemsToRender
            .filter((it) => !(viewed.id === "platform_admin" && it.href === "/dashboard"))
            .map((it) => (
              <ContextRow
                key={it.href}
                item={it}
                active={isActivePath(pathname, it.href)}
                locked={navItemLocked(it, { role, ...accessOpts })}
              />
            ));
        })()}
        {activated && <NavModeToggle simple={simple} toggle={toggleMode} />}
      </nav>
    </div>
  );
}

/**
 * Mobile drawer: full workspace map, each workspace as a labelled group. No rail
 * (touch targets win over density on small screens).
 */
export function NavLinks({ role = "owner", activated = true, metaMode = "qr", enforce = false, caps, modules, disabledFeatures }: { role?: Role; activated?: boolean; metaMode?: NavMode; enforce?: boolean; caps?: Record<string, boolean>; modules?: Partial<Record<ModuleKey, boolean>>; disabledFeatures?: Set<string> }) {
  const pathname = usePathname();
  const [simple, toggleMode] = useNavMode();
  // Same rule as the sidebar: density is the user's preference, not the plan's.
  const spaces = accessibleWorkspaces(role, simple, pathname, { activated, metaMode, enforce, caps, modules, disabledFeatures });
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
              <ContextRow
                key={it.href}
                item={it}
                active={isActivePath(pathname, it.href)}
                locked={navItemLocked(it, { role, activated, metaMode, enforce, caps, modules, disabledFeatures })}
              />
            ))}
          </div>
        </div>
      ))}
      {activated && <NavModeToggle simple={simple} toggle={toggleMode} />}
    </nav>
  );
}
