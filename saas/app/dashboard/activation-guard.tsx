"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";

// Pages an UNACTIVATED owner (no active subscription) may use before paying:
// home, billing, wallet, plan, usage, account settings, support.
const ALLOWED = [
  "/dashboard",
  "/dashboard/billing",
  "/dashboard/wallet",
  "/dashboard/plan",
  "/dashboard/usage",
  "/dashboard/settings",
  "/dashboard/support",
];

function isAllowed(path: string): boolean {
  if (path === "/dashboard") return true;
  return ALLOWED.some((a) => a !== "/dashboard" && (path === a || path.startsWith(a + "/")));
}

/**
 * Hard activation lockdown. For an owner with no active subscription, every page
 * outside the get-started set is blocked at the URL level: a full-screen lock
 * overlays the premium content and the user is redirected to billing. The nav,
 * command palette and APIs are gated elsewhere; this closes direct-URL access.
 */
export default function ActivationGuard({ activated }: { activated: boolean }) {
  const pathname = usePathname();
  const blocked = !activated && !isAllowed(pathname || "");

  if (!blocked) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm">
      <div className="card max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="mb-2 text-xl font-bold text-white">فعّل اشتراكك للمتابعة</h2>
        <p className="mb-5 text-sm leading-relaxed text-slate-400">
          هذه الأداة متاحة بعد تفعيل باقتك. اختر باقتك وأكمل الدفع لفتح كل أدوات KEYONE.
        </p>
        <Link href="/dashboard/billing" className="btn-primary inline-flex px-5 py-2.5 text-sm">
          الذهاب للاشتراك والدفع
        </Link>
      </div>
    </div>
  );
}
