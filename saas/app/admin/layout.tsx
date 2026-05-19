import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import MobileNav from "@/app/dashboard/mobile-nav";
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  ShieldCheck,
  BarChart3,
  Building2,
  Crown,
} from "lucide-react";

export const dynamic = "force-dynamic";

const ADMIN_LINKS = [
  { href: "/admin", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/admin/users", label: "العملاء والاشتراكات", icon: Users },
  { href: "/admin/businesses", label: "الأعمال (Real-time)", icon: Building2 },
  { href: "/admin/plans", label: "الباقات والحدود", icon: Crown },
  { href: "/admin/metrics", label: "المقاييس والاستخدام", icon: BarChart3 },
  { href: "/admin/settings", label: "إعدادات الموقع", icon: Settings },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if ((user as any).role !== "admin") redirect("/dashboard");

  // ── Shared blocks rendered in BOTH mobile drawer and desktop sidebar ──
  const Brand = (
    <div className="border-b border-brand-500/10 p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-red-400/30 bg-gradient-to-br from-red-500 to-orange-500 shadow-[0_0_28px_rgba(239,68,68,0.2)]">
          <ShieldCheck className="w-5 h-5" />
        </span>
        <div>
          <div className="font-bold text-sm">لوحة الإدارة</div>
          <div className="text-xs text-slate-400 truncate max-w-[140px]">
            {user.email}
          </div>
        </div>
      </div>
    </div>
  );

  const NavLinks = (
    <nav className="flex-1 p-3 space-y-1">
      {ADMIN_LINKS.map((n) => {
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold text-slate-200 transition hover:bg-brand-500/10 hover:text-white md:py-2.5"
          >
            <Icon className="w-4 h-4" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  const Footer = (
    <div className="border-t border-brand-500/10 p-3">
      <Link
        href="/dashboard"
        className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold text-slate-400 transition hover:bg-white/10 hover:text-white md:py-2.5"
      >
        <LogOut className="w-4 h-4" />
        الخروج للوحة المستخدم
      </Link>
    </div>
  );

  return (
    <div className="ai-page min-h-screen text-white">
      {/* Mobile drawer — hidden on md+ */}
      <MobileNav pageTitle="لوحة الإدارة">
        {Brand}
        {NavLinks}
        {Footer}
      </MobileNav>

      {/* Desktop sidebar + main content */}
      <div className="md:flex">
        <aside className="sticky top-0 hidden min-h-screen w-64 shrink-0 flex-col border-l border-brand-500/10 bg-[#020806]/86 shadow-[0_0_60px_rgba(0,0,0,0.26)] backdrop-blur-xl md:flex">
          {Brand}
          {NavLinks}
          {Footer}
        </aside>
        <main className="min-h-screen flex-1 p-4 md:p-6 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}
