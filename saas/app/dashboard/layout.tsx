import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Bot } from "lucide-react";
import LogoutButton from "./logout-button";
import MobileNav from "./mobile-nav";
import { NavLinks } from "./nav-items";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isAdmin = (user as any).role === "admin";

  // Shared brand + user blocks rendered in both the desktop sidebar and the
  // mobile drawer. Keeping the JSX inline avoids passing huge children trees
  // through the client MobileNav component.
  const Brand = (
    <Link
      href="/"
      className="flex items-center gap-2 font-bold text-lg p-5 border-b border-white/5"
    >
      <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
        <Bot className="w-5 h-5 text-white" />
      </span>
      <span>ذكاء</span>
    </Link>
  );

  const UserFooter = (
    <div className="p-3 border-t border-white/5">
      <div className="px-3 py-2 mb-2">
        <div className="text-sm font-semibold truncate">{user.name || user.email}</div>
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
    <div className="min-h-screen md:flex">
      {/* Mobile drawer (hidden on md+) */}
      <MobileNav pageTitle="ذكاء">
        {Brand}
        <NavLinks isAdmin={isAdmin} />
        {UserFooter}
      </MobileNav>

      {/* Desktop sidebar (hidden on mobile) */}
      <aside className="hidden md:flex w-64 shrink-0 border-l border-white/5 bg-slate-950 flex-col">
        {Brand}
        <NavLinks isAdmin={isAdmin} />
        {UserFooter}
      </aside>

      {/* Main content. We intentionally drop `max-h-screen overflow-y-auto` —
          that combo breaks iOS momentum scrolling. Scroll lives on the body. */}
      <main className="flex-1 bg-slate-950/50 min-h-screen">
        <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-10">{children}</div>
      </main>
    </div>
  );
}
