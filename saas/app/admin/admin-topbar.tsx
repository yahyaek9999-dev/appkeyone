"use client";

// Admin top bar — page context (breadcrumb), global search trigger (opens the
// existing Cmd/Ctrl+K palette), notifications, and admin identity. Thin, sticky,
// neutral. No decoration.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Bell } from "lucide-react";

// Human labels for the current route segment (breadcrumb tail). Falls back to a
// generic "الإدارة" when a segment isn't mapped — never invents a page name.
const LABELS: Record<string, string> = {
  "": "لوحة التحكم",
  "super-center": "مركز الانتباه",
  notifications: "الإشعارات",
  copilot: "المساعد الذكي",
  "system-health": "صحة النظام",
  analytics: "الإيرادات",
  "usage-stats": "الاستخدام",
  incidents: "الحوادث",
  reports: "التقارير",
  users: "العملاء والاشتراكات",
  customers: "عملاء المنصة",
  businesses: "الأنشطة التجارية",
  "customer-success": "نجاح العملاء",
  risk: "مخاطر التجّار",
  tenants: "تفاصيل التاجر",
  finance: "المركز المالي",
  plans: "الباقات",
  promotions: "العروض",
  payments: "المدفوعات",
  reconciliation: "التسوية",
  invoices: "الفواتير",
  "payment-gateways": "بوابات الدفع",
  "payment-reviews": "مراجعة المدفوعات",
  "feature-control": "مركز الميزات",
  dependencies: "الاعتماديات",
  releases: "الإصدارات",
  jobs: "المهام المجدولة",
  security: "مركز الأمان",
  "audit-log": "سجل التدقيق",
  sla: "مستوى الخدمة",
  backups: "النسخ الاحتياطي",
  settings: "الإعدادات",
  staff: "الفريق",
};

function openSearch() {
  window.dispatchEvent(new CustomEvent("adm-open-search"));
}

export default function AdminTopbar({ identity }: { identity: string }) {
  const pathname = usePathname() || "/admin";
  const segs = pathname.replace(/^\/admin\/?/, "").split("/").filter(Boolean);
  const tail = segs[0] ?? "";
  const label = LABELS[tail] ?? "الإدارة";

  return (
    <div className="adm-topbar">
      <div className="adm-crumb">
        <Link href="/admin" className="adm-link">الإدارة</Link>
        {tail && <span> / <b>{label}</b></span>}
      </div>

      <div style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={openSearch} className="adm-topbar-search" aria-label="بحث">
          <Search className="h-4 w-4" />
          <span>بحث…</span>
          <kbd>⌘K</kbd>
        </button>
        <Link href="/admin/notifications" className="adm-icon-btn" aria-label="الإشعارات">
          <Bell className="h-4 w-4" />
        </Link>
        {identity && (
          <span className="adm-mono" style={{ color: "var(--adm-text-4)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} dir="ltr">
            {identity}
          </span>
        )}
      </div>
    </div>
  );
}
