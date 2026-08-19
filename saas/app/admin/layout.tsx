import Link from "next/link";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import MobileNav from "@/app/dashboard/mobile-nav";
import { AdminNavLinks } from "./nav-links";
import AdminCommandPalette from "./admin-command-palette";
import { ShieldCheck, LogOut } from "lucide-react";
import { AdminBreadcrumb } from "@/components/ui/breadcrumb";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

export const dynamic = "force-dynamic";

function adminSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET not set");
    return new TextEncoder().encode("dev-secret-please-change-min-32-chars-long");
  }
  return new TextEncoder().encode(s);
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // SECURITY: accept EITHER:
  //   (a) an owner whose User.role === "admin"  (main mse_session cookie)
  //   (b) a verified staff member cookie         (mse_staff_session JWT)
  //
  // A team-member of an admin workspace must NOT inherit admin access via (a)
  // because getAuthContext resolves the member → owner. That's why we check
  // isOwner in the main-session path.

  let displayEmail = "";

  // ── Path A: main session (owner admin) ───────────────────────────────────
  const ctx = await getAuthContext();
  const isOwnerAdmin = ctx?.isOwner && (ctx.user as any).role === "admin";

  if (isOwnerAdmin) {
    displayEmail = ctx!.user.email ?? "";
  } else {
    // ── Path B: staff session (mse_staff_session cookie) ───────────────────
    let staffAllowed = false;
    try {
      const jar = cookies();
      const staffToken = jar.get("mse_staff_session")?.value;
      if (staffToken) {
        const { payload } = await jwtVerify(staffToken, adminSecret(), { algorithms: ["HS256"] });
        const sid = (payload as any).sid as string | undefined;
        if (sid) {
          const staff = await (prisma as any).staffMember.findUnique({
            where: { id: sid },
            select: { email: true, active: true },
          });
          if (staff?.active) {
            staffAllowed = true;
            displayEmail = staff.email;
          }
        }
      }
    } catch {
      // invalid/expired token → fall through to redirect
    }
    if (!staffAllowed) redirect("/admin/login");
  }

  // user object for display only — staff path uses `displayEmail`
  const user = ctx?.user;

  const Brand = (
    <div className="flex items-center gap-2 px-4 py-5">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-orange-500 shadow-lg shadow-red-500/20">
        <ShieldCheck className="h-4 w-4 text-white" />
      </span>
      <div>
        <div className="text-sm font-bold text-white">لوحة الإدارة</div>
        <div className="text-[10px] text-slate-500">{displayEmail || user?.email}</div>
      </div>
    </div>
  );

  const Footer = (
    <div className="border-t border-white/[0.06] p-3">
      <Link href="/dashboard" className="sidebar-link">
        <LogOut className="h-4 w-4" />
        الخروج للوحة المستخدم
      </Link>
    </div>
  );

  return (
    <ConfirmProvider>
    <div className="ai-page min-h-screen text-white md:flex">
      {/* Mobile header + drawer */}
      <MobileNav>
        {Brand}
        <AdminNavLinks />
        {Footer}
      </MobileNav>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden min-h-screen w-56 shrink-0 flex-col border-l border-white/[0.06] bg-canvas-deep md:flex">
        {Brand}
        <AdminNavLinks />
        {Footer}
      </aside>

      {/* Page content — always rendered */}
      <main className="min-h-screen flex-1 px-4 pb-safe pt-20 md:px-6 md:pt-8 lg:px-8 lg:pt-10">
        <AdminBreadcrumb />
        {children}
      </main>

      {/* Global admin search — Cmd/Ctrl+K, reachable from every admin page */}
      <AdminCommandPalette />
    </div>
    </ConfirmProvider>
  );
}
