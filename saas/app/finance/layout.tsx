/**
 * /finance — Finance Operations area. Accessible to platform admins AND users
 * with User.role "finance" (A5). A finance operator can review/approve/reject
 * customer payments WITHOUT full owner/admin access.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireFinanceOrAdmin } from "@/lib/finance/access";

export const dynamic = "force-dynamic";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  let actor: any = null;
  try { actor = await requireFinanceOrAdmin(); } catch { redirect("/login"); }
  return (
    <div className="min-h-screen bg-canvas text-slate-100">
      <header className="border-b border-white/10 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-extrabold">KEYONE · المالية</span>
          <nav className="flex gap-3 text-sm">
            <Link href="/finance/payments" className="text-slate-300 hover:text-white">مراجعة المدفوعات</Link>
          </nav>
        </div>
        <div className="text-xs text-slate-400">{(actor as any)?.email} · {(actor as any)?.role}</div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-6">{children}</main>
    </div>
  );
}
