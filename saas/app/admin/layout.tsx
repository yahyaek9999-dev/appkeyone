import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import MobileNav from "@/app/dashboard/mobile-nav";
import { AdminNavLinks } from "./nav-links";
import { ShieldCheck, LogOut } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if ((user as any).role !== "admin") redirect("/dashboard");

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
      <MobileNav>
        {Brand}
        <AdminNavLinks />
        {Footer}
      </MobileNav>

      <div className="hidden md:flex">
        <aside className="sticky top-0 flex min-h-screen w-56 shrink-0 flex-col border-l border-white/[0.06] bg-[#020806]">
          {Brand}
          <AdminNavLinks />
          {Footer}
        </aside>
        <main className="min-h-screen flex-1 px-4 pb-safe pt-6 md:px-6 md:pt-8 lg:px-8 lg:pt-10">
          {children}
        </main>
      </div>
    </div>
  );
}
