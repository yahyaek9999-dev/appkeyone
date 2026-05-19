import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
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

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if ((user as any).role !== "admin") redirect("/dashboard");

  return (
    <div className="ai-page min-h-screen text-white">
      <div className="flex">
        <aside className="sticky top-0 hidden min-h-screen flex-col border-l border-brand-500/10 bg-[#020806]/86 shadow-[0_0_60px_rgba(0,0,0,0.26)] backdrop-blur-xl md:flex md:w-64">
          <div className="border-b border-brand-500/10 p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-red-400/30 bg-gradient-to-br from-red-500 to-orange-500 shadow-[0_0_28px_rgba(239,68,68,0.2)]">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div>
                <div className="font-bold">لوحة الإدارة</div>
                <div className="text-xs text-slate-400">{user.email}</div>
              </div>
            </div>
          </div>
          <nav className="p-3 space-y-1 flex-1">
            <Link
              href="/admin"
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-brand-500/10 hover:text-white"
            >
              <LayoutDashboard className="w-4 h-4" /> الرئيسية
            </Link>
            <Link
              href="/admin/users"
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-brand-500/10 hover:text-white"
            >
              <Users className="w-4 h-4" /> العملاء والاشتراكات
            </Link>
            <Link
              href="/admin/businesses"
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-brand-500/10 hover:text-white"
            >
              <Building2 className="w-4 h-4" /> الأعمال (Real-time)
            </Link>
            <Link
              href="/admin/plans"
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-brand-500/10 hover:text-white"
            >
              <Crown className="w-4 h-4" /> الباقات والحدود
            </Link>
            <Link
              href="/admin/metrics"
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-brand-500/10 hover:text-white"
            >
              <BarChart3 className="w-4 h-4" /> المقاييس والاستخدام
            </Link>
            <Link
              href="/admin/settings"
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-brand-500/10 hover:text-white"
            >
              <Settings className="w-4 h-4" /> إعدادات الموقع
            </Link>
          </nav>
          <div className="border-t border-brand-500/10 p-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <LogOut className="w-4 h-4" /> الخروج للوحة المستخدم
            </Link>
          </div>
        </aside>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
