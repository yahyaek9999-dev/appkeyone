import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import MobileNav from "@/app/dashboard/mobile-nav";
import { AdminNavLinks } from "./nav-links";
import { ShieldCheck, LogOut } from "lucide-react";
import { AdminBreadcrumb } from "@/components/ui/breadcrumb";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // SECURITY: require the PRINCIPAL to be an owner whose User.role is "admin".
  // getCurrentUser() resolves a team-member session to the OWNER user, so a
  // support/viewer member of an admin-owner workspace would otherwise inherit the
  // admin panel and read every tenant's data. Mirror requireAdmin() exactly.
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!ctx.isOwner || (ctx.user as any).role !== "admin") redirect("/dashboard");
  const user = ctx.user;

  const Brand = (
    <div className="flex items-center gap-2 px-4 py-5">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-orange-500 shadow-lg shadow-red-500/20">
        <ShieldCheck className="h-4 w-4 text-white" />
      </span>
      <div>
        <div className="text-sm font-bold text-white">لوحة الإدارة</div>
        <div className="text-[10px] text-slate-500">{user.email}</div>
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
    </div>
  );
}
