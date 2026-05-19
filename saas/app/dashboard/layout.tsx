import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSiteConfig } from "@/lib/admin";
import { BrandMark } from "@/components/ui/marketing";
import LogoutButton from "./logout-button";
import MobileNav from "./mobile-nav";
import { NavLinks } from "./nav-items";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, cfg] = await Promise.all([getCurrentUser(), getSiteConfig()]);
  if (!user) redirect("/login");
  const isAdmin = (user as any).role === "admin";
  const brandName = cfg.brandName || "KEYONE";

  // Shared brand + user blocks rendered in both the desktop sidebar and the
  // mobile drawer. Keeping the JSX inline avoids passing huge children trees
  // through the client MobileNav component.
  const Brand = (
    <Link
      href="/"
      className="flex items-center gap-3 border-b border-brand-500/10 p-5 text-lg font-black tracking-tight text-white"
    >
      <BrandMark className="h-10 w-10 rounded-2xl" iconClassName="h-5 w-5" />
      <span>{brandName}</span>
    </Link>
  );

  const UserFooter = (
    <div className="p-3 border-t border-white/5">
      <div className="px-3 py-2 mb-2">
        <div className="text-sm font-semibold truncate">
          {user.name || user.email}
        </div>
        <div className="text-xs text-slate-500 truncate">{user.email}</div>
        {user.subscription && (
          <div className="mt-2 text-xs">
            <span className="inline-block px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-300 border border-brand-500/30">
              {user.subscription.plan.name}
            </span>
          </div>
        )}
      </div>
      <LogoutButton />
    </div>
  );

  return (
    <div className="ai-page min-h-screen md:flex">
      {/* Mobile drawer (hidden on md+) */}
      <MobileNav pageTitle={brandName}>
        {Brand}
        <NavLinks isAdmin={isAdmin} />
        {UserFooter}
      </MobileNav>

      {/* Desktop sidebar (hidden on mobile) */}
      <aside className="hidden w-64 shrink-0 flex-col border-l border-brand-500/10 bg-[#020806]/86 shadow-[0_0_60px_rgba(0,0,0,0.26)] backdrop-blur-xl md:flex">
        {Brand}
        <NavLinks isAdmin={isAdmin} />
        {UserFooter}
      </aside>

      {/* Main content. We intentionally drop `max-h-screen overflow-y-auto` —
          that combo breaks iOS momentum scrolling. Scroll lives on the body. */}
      <main className="min-h-screen flex-1 bg-black/10">
        <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-10">{children}</div>
      </main>
    </div>
  );
}
