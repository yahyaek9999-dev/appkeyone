import { getAuthContext } from "@/lib/auth";
import { redirect } from "next/navigation";
import { can } from "@/lib/rbac";
import { CreditCard, Mail, User, Phone, Sparkles, ChevronLeft, MessageSquare, ShieldCheck, Crown, Users } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { FadeInView } from "@/components/ui/stagger-reveal";

export default async function SettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  const user = ctx.user;
  const sub = user.subscription;
  const showBilling = ctx.isOwner; // billing/subscription is owner-only
  const showSettingsLinks = can(ctx.role, "settings");
  const showTeam = can(ctx.role, "team");

  const displayName = ctx.member?.name || user.name || "—";
  const usagePct = sub && sub.plan.monthlyMsgs > 0
    ? Math.min(100, Math.round((sub.msgsUsed / sub.plan.monthlyMsgs) * 100))
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">حسابي</h1>
        <p className="page-desc">معلومات الحساب والاشتراك</p>
      </div>

      {/* Hero identity card */}
      <FadeInView>
        <div className="surface relative overflow-hidden p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={displayName} size="xl" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-semibold text-white">{displayName}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{ctx.principalEmail}</span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {!ctx.isOwner && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/20 bg-sky-500/8 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                    <ShieldCheck className="h-3 w-3" /> عضو فريق — {ctx.role}
                  </span>
                )}
                {sub && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-brand-500/20 bg-brand-500/8 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
                    <Crown className="h-3 w-3 text-amber-400" />
                    {sub.status === "trial" ? "تجربة مجانية" : sub.plan.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </FadeInView>

      <FadeInView delay={0.05}>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="section-title mb-4">المعلومات الشخصية</h2>
          <div className="divide-y divide-white/[0.04] text-sm">
            <SettingRow icon={<User className="h-4 w-4" />} label="الاسم" value={displayName} />
            <SettingRow icon={<Mail className="h-4 w-4" />} label="البريد" value={ctx.principalEmail} />
            <SettingRow icon={<Phone className="h-4 w-4" />} label="الموبايل" value={user.phone || "—"} />
          </div>
        </div>

        {showBilling && (
        <div className="card p-5">
          <h2 className="section-title mb-4">الاشتراك</h2>
          {sub ? (
            <div className="space-y-4">
              <div className="divide-y divide-white/[0.04] text-sm">
                <SettingRow
                  icon={<Crown className="h-4 w-4 text-amber-400" />}
                  label="الخطة"
                  value={
                    <span className="inline-flex items-center gap-1 rounded-md border border-brand-500/20 bg-brand-500/8 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
                      {sub.status === "trial" ? "تجربة مجانية" : sub.plan.name}
                    </span>
                  }
                />
                <SettingRow icon={<Mail className="h-4 w-4" />} label="ينتهي في" value={new Date(sub.expiresAt).toLocaleDateString("ar-EG")} />
              </div>

              {/* Usage meter */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5">
                <div className="mb-2 flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 font-medium text-slate-400">
                    <CreditCard className="h-3.5 w-3.5" /> الرسائل المستخدمة
                  </span>
                  <span className="tabular-nums text-slate-400">
                    {sub.msgsUsed.toLocaleString()} / {sub.plan.monthlyMsgs.toLocaleString()}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={`h-full rounded-full ${usagePct > 90 ? "bg-rose-500" : usagePct > 70 ? "bg-amber-500" : "bg-brand-500"}`}
                    style={{ width: `${usagePct}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">لا يوجد اشتراك نشط</p>
          )}
          <Link href="/pricing" className="btn-primary mt-5 w-full justify-center">ترقية الخطة</Link>
        </div>
        )}
      </div>
      </FadeInView>

      {(showSettingsLinks || showTeam) && (
      <FadeInView delay={0.1}>
      <div className="card divide-y divide-white/[0.04] overflow-hidden">
        {showSettingsLinks && (
        <>
        <SettingLink href="/dashboard/settings/ai-provider" icon={<Sparkles className="h-5 w-5 text-brand-300" />}
          title="مزوّد الذكاء الاصطناعي"
          desc="اشتغل بـ KEYONE AI أو اربط مزوّدك الخاص (OpenAI / Gemini / Claude / Groq / OpenRouter)" />
        <SettingLink href="/dashboard/settings/meta-cloud" icon={<MessageSquare className="h-5 w-5 text-emerald-300" />}
          title="واتساب — وضع الاتصال"
          desc="اختر QR Code أو Meta Cloud API الرسمي. يضمن استقرار طويل المدى والامتثال لسياسة Meta." />
        <SettingLink href="/dashboard/compliance" icon={<ShieldCheck className="h-5 w-5 text-amber-300" />}
          title="صحة الإرسال والامتثال"
          desc="تتبع حالة التسليم، جودة الرقم، الـ webhooks، والقوالب المعتمدة — كله من بيانات حقيقية." />
        </>
        )}
        {showTeam && (
        <SettingLink href="/dashboard/settings/team" icon={<Users className="h-5 w-5 text-sky-300" />}
          title="إدارة الفريق والأدوار"
          desc="أضف أعضاء الفريق وحدد صلاحياتهم: مدير، مبيعات، دعم، أو مشاهد." />
        )}
      </div>
      </FadeInView>
      )}
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
    <Link href={href} className="group flex items-center gap-3 p-4 transition hover:bg-white/[0.03]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] transition-colors group-hover:border-white/[0.12]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-slate-500">{desc}</div>
      </div>
      <ChevronLeft className="h-4 w-4 shrink-0 text-slate-600 transition-transform group-hover:-translate-x-0.5" />
    </Link>
  );
}
