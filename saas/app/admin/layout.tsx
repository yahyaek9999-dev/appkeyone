import Link from "next/link";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import MobileNav from "@/app/dashboard/mobile-nav";
import { AdminNavLinks } from "./nav-links";
import AdminCommandPalette from "./admin-command-palette";
import AdminTopbar from "./admin-topbar";
import { ShieldCheck, LogOut } from "lucide-react";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import "./admin-ui.css";

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
  const identity = displayEmail || user?.email || "";

  // Brand mark + nav + footer are shared between the desktop rail and the mobile drawer.
  const BrandMark = (
    <div className="adm-rail-brand">
      <span className="adm-rail-mark"><ShieldCheck className="h-4 w-4" /></span>
      <div className="min-w-0">
        <div className="adm-rail-title">WKEYONE</div>
        <div className="adm-rail-sub">مركز التحكّم</div>
      </div>
    </div>
  );

  const Footer = (
    <div className="adm-rail-foot">
      <Link href="/dashboard" className="adm-nav-link">
        <LogOut />
        الخروج للوحة المستخدم
      </Link>
    </div>
  );

  return (
    <ConfirmProvider>
      <div className="adm">
        <div className="adm-shell">
          {/* Mobile drawer (reuses existing MobileNav shell) */}
          <div className="md:hidden">
            <MobileNav>
              {BrandMark}
              <div className="adm-nav"><AdminNavLinks /></div>
              {Footer}
            </MobileNav>
          </div>

          {/* Desktop rail */}
          <aside className="adm-rail hidden md:flex">
            {BrandMark}
            <nav className="adm-nav"><AdminNavLinks /></nav>
            {Footer}
          </aside>

          {/* Main column */}
          <div className="adm-main">
            <AdminTopbar identity={identity} />
            <main className="adm-content">
              {children}
            </main>
          </div>
        </div>

        {/* Global admin search — Cmd/Ctrl+K, reachable everywhere */}
        <AdminCommandPalette />
      </div>
    </ConfirmProvider>
  );
}
