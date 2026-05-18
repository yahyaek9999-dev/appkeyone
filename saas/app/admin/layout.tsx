import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LayoutDashboard, Users, Settings, LogOut, ShieldCheck, BarChart3, Building2, Crown } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if ((user as any).role !== "admin") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="flex">
        <aside className="hidden md:flex md:w-64 flex-col bg-slate-900/60 border-l border-white/5 min-h-screen sticky top-0">
          <div className="p-5 border-b border-white/5">
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div>
                <div className="font-bold">لوحة الإدارة</div>
                <div className="text-xs text-slate-400">{user.email}</div>
              </div>
            </div>
          </div>
          <nav className="p-3 space-y-1 flex-1">
            <Link href="/admin" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-slate-200">
              <LayoutDashboard className="w-4 h-4" /> الرئيسية
            </Link>
            <Link href="/admin/users" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-slate-200">
              <Users className="w-4 h-4" /> العملاء والاشتراكات
            </Link>
            <Link href="/admin/businesses" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-slate-200">
              <Building2 className="w-4 h-4" /> الأعمال (Real-time)
            </Link>
            <Link href="/admin/plans" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-slate-200">
              <Crown className="w-4 h-4" /> الباقات والحدود
            </Link>
            <Link href="/admin/metrics" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-slate-200">
              <BarChart3 className="w-4 h-4" /> المقاييس والاستخدام
            </Link>
            <Link href="/admin/settings" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-slate-200">
              <Settings className="w-4 h-4" /> إعدادات الموقع
            </Link>
          </nav>
          <div className="p-3 border-t border-white/5">
            <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-slate-400 text-sm">
              <LogOut className="w-4 h-4" /> الخروج للوحة المستخدم
            </Link>
          </div>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
