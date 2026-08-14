import { redirect } from "next/navigation";
import Link from "next/link";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import { MessageCircle, Settings, FileText, List, Wallet } from "lucide-react";

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
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-brand-500/10 p-3">
          <MessageCircle className="h-6 w-6 text-brand-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">K1SMS</h1>
          <p className="text-sm text-slate-400">إرسال رسائل SMS تجارية متعددة المزوّدين</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SMS_SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-xl border border-white/[0.07] bg-canvas-raised p-5 transition-all duration-150 hover:border-brand-500/40 hover:bg-white/[0.03]"
          >
            <div className="mb-3 inline-flex rounded-lg bg-brand-500/10 p-2">
              <s.icon className="h-5 w-5 text-brand-400" />
            </div>
            <h3 className="font-semibold text-white group-hover:text-brand-300">{s.label}</h3>
            <p className="mt-1 text-sm text-slate-400">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
