import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSiteConfig } from "@/lib/admin";
import { BrandMark } from "@/components/ui/marketing";
import { LayoutDashboard, ShieldCheck } from "lucide-react";
import LogoutButton from "./logout-button";
import MobileNav from "./mobile-nav";
import { NavLinks, SidebarNav } from "./nav-items";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, cfg] = await Promise.all([getCurrentUser(), getSiteConfig()]);
  if (!user) redirect("/login");
  const isAdmin = (user as any).role === "admin";
  const brandName = cfg.brandName || "KEYONE";

  const Brand = (
    <Link
      href="/dashboard"
      className="flex items-center gap-3 px-4 py-5"
    >
      <BrandMark className="h-8 w-8 rounded-xl" iconClassName="h-4 w-4" />
      <div>
        <div className="text-sm font-bold text-white">{brandName}</div>
        <div className="text-[10px] text-slate-500">لوحة التحكم</div>
      </div>
    </Link>
  );

  const UserFooter = (
    <div className="border-t border-white/[0.06] p-3">
      <div className="mb-2 px-3 py-2">
        <div className="truncate text-sm font-medium text-white">{user.name || user.email}</div>
        <div className="truncate text-xs text-slate-500">{user.email}</div>
        {user.subscription && (
          <div className="mt-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-brand-500/20 bg-brand-500/8 px-2 py-0.5 text-[10px] font-semibold text-brand-300">
              <LayoutDashboard className="h-2.5 w-2.5" />
              {user.subscription.plan.name}
            </span>
          </div>
        )}
      </div>
      <LogoutButton />
    </div>
  );

  const AdminLink = isAdmin ? (
    <Link
      href="/admin"
      className="sidebar-link text-amber-400/70 hover:text-amber-300"
    >
      <ShieldCheck className="h-4 w-4" />
      لوحة الإدارة
    </Link>
  ) : null;

  return (
    <div className="ai-page min-h-screen md:flex">
      <MobileNav>
        {Brand}
        <div className="px-3 pt-1">
          {AdminLink}
        </div>
        <NavLinks />
        {UserFooter}
      </MobileNav>

      <aside className="hidden w-56 shrink-0 flex-col border-l border-white/[0.06] bg-[#020806] md:flex">
        {Brand}
        <SidebarNav adminLink={AdminLink} />
        {UserFooter}
      </aside>

      <main className="min-h-screen min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl min-w-0 px-4 pb-safe pt-6 md:px-6 md:pt-8 lg:px-8 lg:pt-10">
          {children}
        </div>
      </main>
    </div>
  );
}
