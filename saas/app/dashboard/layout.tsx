import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getSiteConfig } from "@/lib/admin";
import Image from "next/image";
import { LayoutDashboard, ShieldCheck } from "lucide-react";
import LogoutButton from "./logout-button";
import MobileNav from "./mobile-nav";
import { NavLinks, SidebarNav } from "./nav-items";
import { normalizeConnectionMode } from "@/lib/messaging/mode";
import CommandPalette from "./command-palette";
import CommandTrigger from "./command-trigger";
import HelpDrawer from "./help-drawer";
import PageTransition from "./page-transition";
import { ToastProvider } from "@/components/ui/toast";
import DashboardTour from "./dashboard-tour";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ctx, cfg] = await Promise.all([getAuthContext(), getSiteConfig()]);
  if (!ctx) redirect("/login");
  const user = ctx.user;
  const role = ctx.role;
  // Platform admin link only for the OWNER whose account is a platform admin —
  // a team member never inherits the admin panel.
  const isAdmin = ctx.isOwner && (user as any).role === "admin";
  const brandName = cfg.brandName || "KEYONE";
  // Pre-activation gate (visibility): an owner with no ACTIVE subscription sees
  // only the get-started essentials (welcome/billing/plan/account). Platform
  // admins and team members of an active workspace are always "activated".
  const sub = (user as any).subscription;
  const activated = !ctx.isOwner || isAdmin || (!!sub && sub.status === "active");
  // Connection-mode visibility: Meta merchants never see QR pages and vice-versa.
  const metaMode: "qr" | "meta" =
    normalizeConnectionMode((user as any).bot?.connectionMode) === "meta_cloud" ? "meta" : "qr";

  const Brand = (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-3.5 py-4">
      <span className="relative h-7 w-11 shrink-0 overflow-hidden">
        <Image
          src="/logo.png"
          alt={brandName}
          fill
          quality={100}
          className="object-contain drop-shadow-[0_0_8px_rgba(201,162,75,0.22)]"
          priority
        />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-white">{brandName}</div>
        <div className="text-[10px] text-slate-500">مساحة العمل</div>
      </div>
    </Link>
  );

  const UserFooter = (
    <div className="border-t border-white/[0.06] p-2.5">
      <div className="mb-2 px-2.5 py-1.5">
        <div className="truncate text-[13px] font-medium text-white">{ctx.member?.name || ctx.member?.email || user.name || user.email}</div>
        <div className="truncate text-xs text-slate-500">{ctx.principalEmail}</div>
        {!ctx.isOwner && (
          <div className="mt-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/20 bg-sky-500/8 px-2 py-0.5 text-[10px] font-medium text-sky-300">
              <ShieldCheck className="h-2.5 w-2.5" />
              عضو فريق — {role}
            </span>
          </div>
        )}
        {ctx.isOwner && user.subscription && (
          <div className="mt-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-brand-500/20 bg-brand-500/8 px-2 py-0.5 text-[10px] font-medium text-brand-300">
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
    <Link href="/admin" className="sidebar-link text-amber-400/80 hover:text-amber-300">
      <ShieldCheck className="h-[18px] w-[18px]" />
      لوحة الإدارة
    </Link>
  ) : null;

  return (
    <ToastProvider>
      <ConfirmProvider>
        <CommandPalette role={role} activated={activated} metaMode={metaMode} />
        <div className="ai-page min-h-screen md:flex">
          <MobileNav brandName={brandName}>
            {Brand}
            <div className="px-2.5 pb-2">
              <CommandTrigger />
            </div>
            <div className="px-3 pt-1">{AdminLink}</div>
            <NavLinks role={role} activated={activated} metaMode={metaMode} />
            {UserFooter}
          </MobileNav>

          <aside data-tour="sidebar" className="hidden w-64 shrink-0 flex-col border-l border-white/[0.06] bg-canvas-deep md:flex">
            <div className="border-b border-white/[0.06]">
              {Brand}
              <div className="px-2.5 pb-2.5" data-tour="search">
                <CommandTrigger />
              </div>
            </div>
            <SidebarNav adminLink={AdminLink} role={role} activated={activated} metaMode={metaMode} />
            {UserFooter}
          </aside>
          <DashboardTour />

          <main className="min-h-screen min-w-0 flex-1">
            <div className="mx-auto w-full max-w-6xl min-w-0 px-4 pb-safe pt-6 md:px-8 md:pt-8 lg:pt-10">
              <PageTransition>{children}</PageTransition>
            </div>
            <HelpDrawer />
          </main>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
