import Link from "next/link";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getSiteConfig } from "@/lib/admin";
import Image from "next/image";
import { LayoutDashboard, ShieldCheck } from "lucide-react";
import LogoutButton from "./logout-button";
import { NavLinks, SidebarNav } from "./nav-items";
import { normalizeConnectionMode } from "@/lib/messaging/mode";
import { getEntitlements } from "@/lib/membership/entitlements";
import { isActiveSubscription } from "@/lib/membership/plan";
import { getCustomerInvisibleFeatureIds } from "@/lib/feature-control";
import { getWhiteLabelConfig } from "@/lib/whitelabel/resolve";
import { resolveBusinessContext } from "@/lib/business-context";
import type { Metadata } from "next";
import CommandPalette from "./command-palette";
import CommandTrigger from "./command-trigger";
import HelpDrawer from "./help-drawer";
import { ToastProvider } from "@/components/ui/toast";
import { MaintenanceBanner } from "@/components/ui/maintenance-banner";
import { DashboardBreadcrumb } from "@/components/ui/breadcrumb";

// framer-motion is a heavy dependency; code-split it out of the shared
// dashboard bundle instead of shipping it on every page via a static import.
const MobileNav = dynamic(() => import("./mobile-nav"));
const PageTransition = dynamic(() => import("./page-transition"));
import DashboardTour from "./dashboard-tour";
import ActivationGuard from "./activation-guard";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

// White-label: override the browser tab title + favicon for dashboard routes
// when a tenant has branding enabled. Falls back to the platform defaults.
export async function generateMetadata(): Promise<Metadata> {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return {};
  const wl = await getWhiteLabelConfig(ctx.user.id).catch(() => null);
  if (!wl || !wl.enabled) return {};
  const meta: Metadata = {};
  if (wl.brandName) meta.title = { absolute: wl.brandName };
  if (wl.faviconUrl) meta.icons = { icon: wl.faviconUrl };
  return meta;
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Both calls are guarded against transient DB errors. getAuthContext() failure
  // → null → redirect to /login (fail-closed). getSiteConfig() never throws (see lib/admin.ts).
  const [ctx, cfg] = await Promise.all([
    getAuthContext().catch(() => null),
    getSiteConfig(),
  ]);
  if (!ctx) redirect("/login");
  const user = ctx.user;
  const role = ctx.role;
  // Platform admin link only for the OWNER whose account is a platform admin —
  // a team member never inherits the admin panel.
  const isAdmin = ctx.isOwner && (user as any).role === "admin";
  const brandName = cfg.brandName || "KEYONE";
  // White-label (Phase 7): a tenant's saved branding overrides the platform
  // default at runtime. Reads the OWNER's config so team members inherit it too.
  const wl = await getWhiteLabelConfig(user.id).catch(() => null);
  const wlOn = !!(wl && wl.enabled);
  const brand = wlOn && wl!.brandName ? wl!.brandName : brandName;
  const brandLogo = wlOn && wl!.logoUrl ? wl!.logoUrl : null;
  const brandColor = wlOn && wl!.primaryColor ? wl!.primaryColor : null;
  // Pre-activation gate (visibility): an owner with no ACTIVE subscription sees
  // only the get-started essentials (welcome/billing/plan/account). Platform
  // admins and team members of an active workspace are always "activated".
  const sub = (user as any).subscription;
  // A granted, unexpired trial counts as activated (unlocks the full nav) —
  // same rule the entitlements layer uses, so nav and gating never disagree.
  const activated = !ctx.isOwner || isAdmin || isActiveSubscription(sub);
  // Connection-mode visibility: Meta merchants never see QR pages and vice-versa.
  const metaMode: "qr" | "meta" =
    normalizeConnectionMode((user as any).bot?.connectionMode) === "meta_cloud" ? "meta" : "qr";
  // Per-plan ENTITLEMENT (not visibility): destinations the plan doesn't own are
  // still listed, rendered with a lock + upgrade CTA. k_* plans only; legacy /
  // fallback plans aren't enforced — non-regressive, matches backend gating.
  // Platform admin bypasses all capability gates (sees all existing pages).
  const ent = await getEntitlements(user.id).catch(() => null);
  const enforce = isAdmin ? false : !!ent?.enforce;
  const caps = ent?.capabilities;
  // Business Type → workspace module map. Owner-scoped (team members inherit,
  // like white-label/entitlements). Null/error → Store + all modules ON, so
  // existing tenants and any DB hiccup are fully non-regressive.
  const bizCtx = await resolveBusinessContext(user.id).catch(() => null);
  const modules = bizCtx?.modules;

  // Feature-level customer visibility gate. Admin principals bypass entirely
  // (undefined = no gate). Regular owners/members receive the set of featureIds
  // that FeatureControl.customerVisible=false so the nav hides them.
  const disabledFeatures = isAdmin
    ? undefined
    : await getCustomerInvisibleFeatureIds().catch(() => undefined);

  const Brand = (
    <Link href="/dashboard" className="group flex items-center gap-3 px-3.5 py-4">
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/[0.12] shadow-[0_0_20px_rgba(12,122,108,0.30)] transition-shadow duration-300 group-hover:shadow-[0_0_28px_rgba(12,122,108,0.45)]">
        {brandLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brandLogo} alt={brand} className="h-full w-full object-cover" />
        ) : (
          <Image
            src="/wkeyone-logo.png"
            alt={brand}
            fill
            quality={95}
            className="object-cover"
            priority
          />
        )}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-white">{brand}</div>
        <div className="text-[10px] text-slate-500" style={brandColor ? { color: brandColor } : undefined}>مساحة العمل</div>
      </div>
    </Link>
  );

  const displayName = ctx.member?.name || ctx.member?.email || user.name || user.email || "";
  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const UserFooter = (
    <div className="border-t border-white/[0.06] p-2.5">
      <div className="mb-2 flex items-center gap-2.5 rounded-lg px-2 py-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand-500/30 bg-brand-500/10 text-[10px] font-semibold text-brand-300 shadow-[0_0_10px_rgba(12,122,108,0.2)]">
          {initials || "؟"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium text-white leading-tight">{displayName}</div>
          {ctx.principalEmail && displayName !== ctx.principalEmail && (
            <div className="truncate text-[10px] text-slate-500 leading-tight mt-0.5">{ctx.principalEmail}</div>
          )}
        </div>
      </div>
      {!ctx.isOwner && (
        <div className="mb-2 px-2">
          <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/20 bg-sky-500/[0.08] px-2 py-0.5 text-[10px] font-medium text-sky-300">
            <ShieldCheck className="h-2.5 w-2.5" />
            عضو فريق — {role}
          </span>
        </div>
      )}
      {ctx.isOwner && user.subscription && (
        <div className="mb-2 px-2">
          <span className="inline-flex items-center gap-1 rounded-md border border-brand-500/20 bg-brand-500/[0.08] px-2 py-0.5 text-[10px] font-medium text-brand-300">
            <LayoutDashboard className="h-2.5 w-2.5" />
            {user.subscription.plan.name}
          </span>
        </div>
      )}
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
        <ActivationGuard activated={activated} />
        <CommandPalette role={role} activated={activated} metaMode={metaMode} enforce={enforce} caps={caps} modules={modules} disabledFeatures={disabledFeatures} />
        {(cfg as any).maintenanceMode ? <MaintenanceBanner message={(cfg as any).maintenanceMessage} /> : null}
        <div className="ai-page min-h-screen md:flex" style={brandColor ? ({ ["--wl-primary" as any]: brandColor } as React.CSSProperties) : undefined}>
          <MobileNav brandName={brand}>
            {Brand}
            <div className="px-2.5 pb-2">
              <CommandTrigger />
            </div>
            <div className="px-3 pt-1">{AdminLink}</div>
            <NavLinks role={role} activated={activated} metaMode={metaMode} enforce={enforce} caps={caps} modules={modules} disabledFeatures={disabledFeatures} />
            {UserFooter}
          </MobileNav>

          <aside data-tour="sidebar" className="hidden w-64 shrink-0 flex-col border-l border-white/[0.06] bg-canvas-deep md:flex relative overflow-hidden">
            {/* Ambient top glow — purely decorative */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_50%_0%,rgba(12,122,108,0.10),transparent_70%)]" />
            <div className="border-b border-white/[0.06] relative">
              {Brand}
              <div className="px-2.5 pb-2.5" data-tour="search">
                <CommandTrigger />
              </div>
            </div>
            <SidebarNav adminLink={AdminLink} role={role} activated={activated} metaMode={metaMode} enforce={enforce} caps={caps} modules={modules} isPlatformAdmin={isAdmin} disabledFeatures={disabledFeatures} />
            {UserFooter}
          </aside>
          <DashboardTour />

          <main className="min-h-screen min-w-0 flex-1">
            <div className="mx-auto w-full max-w-6xl min-w-0 px-4 pb-safe pt-6 md:px-8 md:pt-8 lg:pt-10">
              <DashboardBreadcrumb />
              <PageTransition>{children}</PageTransition>
            </div>
            <HelpDrawer />
          </main>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
