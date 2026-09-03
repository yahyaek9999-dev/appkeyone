import { redirect } from "next/navigation";
import Link from "next/link";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import { MessageCircle, Settings, FileText, List, Wallet, ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "K1SMS" };

const SMS_SECTIONS = [
  { href: "/dashboard/sms/providers", icon: Settings, label: "مزوّدو SMS", desc: "إدارة مزوّدي الإرسال وفحص الاتصال" },
  { href: "/dashboard/sms/templates", icon: FileText, label: "قوالب الرسائل", desc: "رسائل الطلبات، التأكيد، الحالة، OTP" },
  { href: "/dashboard/sms/messages", icon: List, label: "سجل الرسائل", desc: "مراقبة حالة الإرسال والتسليم" },
  { href: "/dashboard/sms/credits", icon: Wallet, label: "الرصيد والمحفظة", desc: "رصيد SMS وكشف الحساب التفصيلي" },
];

export default async function SmsHubPage() {
  const g = await pageGate("k1sms");
  if (!g.uid) redirect("/login");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="K1SMS — رسائل SMS"
          description="أرسل رسائل SMS لتأكيد الطلبات وتحديثات الحالة والـ OTP عبر مزوّدين متعددين."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-white/[0.05] pb-5">
        <p className="eyebrow mb-2">التسويق</p>
        <h1 className="page-title">K1SMS</h1>
        <p className="page-desc mt-2">
          قناة احتياطية للرسائل التي لا تصلح لواتساب — تأكيد الطلب، رمز التحقق، وتحديث الشحن —
          عبر مزوّدين متعددين برصيد منفصل.
        </p>
      </div>

      {/* Evidence (Phase 11, screenshot 23): four identical dark rectangles,
          each with the same emerald icon tile in the same corner and two lines
          of the same-sized text. Nothing said which one to open first, and the
          repeated icon-tile-in-a-box is the clearest AI-template tell in the
          product. This is a setup path, not four peers — so it renders as an
          ordered list where the step you need first leads. */}
      <nav aria-label="أقسام K1SMS" className="overflow-hidden rounded-xl border border-white/[0.07]">
        <ul className="divide-y divide-white/[0.04]">
          {SMS_SECTIONS.map((s, i) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/50 focus-visible:ring-inset"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.04] text-[11px] font-semibold tabular-nums text-slate-500">
                  {i + 1}
                </span>
                <s.icon className="h-4 w-4 shrink-0 text-slate-500 transition-colors group-hover:text-brand-300" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-white transition-colors group-hover:text-brand-300">
                    {s.label}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-slate-500">{s.desc}</span>
                </span>
                <ChevronLeft className="h-4 w-4 shrink-0 text-slate-600 transition-transform group-hover:-translate-x-0.5 group-hover:text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
