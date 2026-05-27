import { requireUser } from "@/lib/auth";
import { CreditCard, Mail, User, Phone, Sparkles, ChevronLeft, MessageSquare, ShieldCheck, Crown } from "lucide-react";
import Link from "next/link";

export default async function SettingsPage() {
  const user = await requireUser();
  const sub = user.subscription;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">حسابي</h1>
        <p className="page-desc">معلومات الحساب والاشتراك</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="section-title mb-4">المعلومات الشخصية</h2>
          <div className="space-y-1 text-sm divide-y divide-white/[0.04]">
            <SettingRow icon={<User className="h-4 w-4" />} label="الاسم" value={user.name || "—"} />
            <SettingRow icon={<Mail className="h-4 w-4" />} label="البريد" value={user.email} />
            <SettingRow icon={<Phone className="h-4 w-4" />} label="الموبايل" value={user.phone || "—"} />
          </div>
        </div>

        <div className="card p-5">
          <h2 className="section-title mb-4">الاشتراك</h2>
          {sub ? (
            <div className="space-y-1 text-sm divide-y divide-white/[0.04]">
              <SettingRow
                icon={<Crown className="h-4 w-4 text-amber-400" />}
                label="الخطة"
                value={
                  <span className="inline-flex items-center gap-1 rounded-md border border-brand-500/20 bg-brand-500/8 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
                    {sub.status === "trial" ? "تجربة مجانية" : sub.plan.name}
                  </span>
                }
              />
              <SettingRow icon={<CreditCard className="h-4 w-4" />} label="الرسائل المستخدمة" value={`${sub.msgsUsed} / ${sub.plan.monthlyMsgs}`} />
              <SettingRow icon={<Mail className="h-4 w-4" />} label="ينتهي في" value={new Date(sub.expiresAt).toLocaleDateString("ar-EG")} />
            </div>
          ) : (
            <p className="text-sm text-slate-500">لا يوجد اشتراك نشط</p>
          )}
          <button className="btn-primary mt-5 w-full">ترقية الخطة</button>
        </div>
      </div>

      <div className="divide-y divide-white/[0.04] rounded-2xl border border-white/[0.06]">
        <SettingLink href="/dashboard/settings/ai-provider" icon={<Sparkles className="h-5 w-5 text-brand-300" />}
          title="مزوّد الذكاء الاصطناعي"
          desc="اشتغل بـ KEYONE AI أو اربط مزوّدك الخاص (OpenAI / Gemini / Claude / Groq / OpenRouter)" />
        <SettingLink href="/dashboard/settings/meta-cloud" icon={<MessageSquare className="h-5 w-5 text-emerald-300" />}
          title="واتساب — وضع الاتصال"
          desc="اختر QR Code أو Meta Cloud API الرسمي. يضمن استقرار طويل المدى والامتثال لسياسة Meta." />
        <SettingLink href="/dashboard/compliance" icon={<ShieldCheck className="h-5 w-5 text-amber-300" />}
          title="صحة الإرسال والامتثال"
          desc="تتبع حالة التسليم، جودة الرقم، الـ webhooks، والقوالب المعتمدة — كله من بيانات حقيقية." />
      </div>
    </div>
  );
}

function SettingRow({ icon, label, value }: any) {
  return (
    <div className="flex items-center justify-between py-2.5 text-sm">
      <div className="flex items-center gap-2 text-slate-400">{icon}<span>{label}</span></div>
      <div className="font-medium text-white">{value}</div>
    </div>
  );
}

function SettingLink({ href, icon, title, desc }: { href: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 p-4 transition hover:bg-white/[0.03]">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
      </div>
      <ChevronLeft className="h-4 w-4 shrink-0 text-slate-600" />
    </Link>
  );
}
