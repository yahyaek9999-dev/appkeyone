import Link from "next/link";
import {
  LayoutDashboard,
  Bot,
  BookOpen,
  Users,
  MessageSquare,
  Settings,
  Phone,
  ShieldCheck,
  Flame,
  Inbox,
  Zap,
  Clock,
  Megaphone,
  Lightbulb,
  BarChart3,
  ShoppingBag,
  Brain,
  Shield,
  Crown,
} from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "نظرة عامة", icon: LayoutDashboard },
  { href: "/dashboard/analytics", label: "الإحصائيات", icon: BarChart3 },
  { href: "/dashboard/inbox", label: "الواردات", icon: Inbox },
  { href: "/dashboard/orders", label: "الطلبات", icon: ShoppingBag },
  { href: "/dashboard/intel", label: "ذكاء المبيعات", icon: Brain },
  { href: "/dashboard/leads", label: "العملاء المحتملون", icon: Flame },
  { href: "/dashboard/broadcasts", label: "الإرسال الجماعي", icon: Megaphone },
  { href: "/dashboard/customers", label: "العملاء", icon: Users },
  { href: "/dashboard/bot", label: "إعدادات البوت", icon: Bot },
  { href: "/dashboard/quick-replies", label: "الردود السريعة", icon: Zap },
  { href: "/dashboard/working-hours", label: "ساعات العمل", icon: Clock },
  { href: "/dashboard/knowledge", label: "قاعدة المعرفة", icon: BookOpen },
  { href: "/dashboard/suggestions", label: "اقتراحات المعرفة", icon: Lightbulb },
  { href: "/dashboard/playground", label: "تجربة البوت", icon: MessageSquare },
  { href: "/dashboard/whatsapp", label: "ربط واتساب", icon: Phone },
  { href: "/dashboard/safety", label: "الأمان والحماية", icon: Shield },
  { href: "/dashboard/usage", label: "استخدام الباقة", icon: Crown },
  { href: "/dashboard/settings", label: "حسابي", icon: Settings },
];

/**
 * Renders the nav link list used by BOTH the desktop sidebar and the mobile
 * drawer. Kept identical so the experience matches across screens.
 *
 * Touch targets are intentionally larger (py-3 ≈ 48px) on mobile to satisfy
 * Apple/Google accessibility guidance (≥44px); on desktop they collapse to the
 * original py-2.5 (40px).
 */
export function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  return (
    <nav className="flex-1 p-3 space-y-1">
      {isAdmin && (
        <Link
          href="/admin"
          className="flex items-center gap-3 px-3 py-3 md:py-2.5 mb-2 rounded-xl bg-gradient-to-l from-red-500/15 to-orange-500/15 border border-red-500/30 text-red-200 hover:from-red-500/25 hover:to-orange-500/25 transition text-sm font-semibold"
        >
          <ShieldCheck className="w-4 h-4" />
          لوحة الإدارة
        </Link>
      )}
      {NAV_ITEMS.map((n) => {
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            className="flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-xl text-slate-300 hover:bg-white/5 hover:text-white transition text-sm"
          >
            <Icon className="w-4 h-4" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
