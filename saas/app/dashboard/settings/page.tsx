import { requireUser } from "@/lib/auth";
import { CreditCard, Mail, User, Phone, Sparkles, ChevronLeft, MessageSquare, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default async function SettingsPage() {
  const user = await requireUser();
  const sub = user.subscription;
  return (
    <div>
      <h1 className="text-3xl font-extrabold mb-2">حسابي</h1>
      <p className="text-slate-400 mb-8">معلومات الحساب والاشتراك</p>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="font-bold text-lg mb-4">المعلومات الشخصية</h2>
          <div className="space-y-3 text-sm">
            <Row icon={<User className="w-4 h-4" />} label="الاسم" value={user.name || "—"} />
            <Row icon={<Mail className="w-4 h-4" />} label="البريد" value={user.email} />
            <Row icon={<Phone className="w-4 h-4" />} label="الموبايل" value={user.phone || "—"} />
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-bold text-lg mb-4">الاشتراك</h2>
          {sub ? (
            <div className="space-y-3 text-sm">
              <Row
                icon={<CreditCard className="w-4 h-4" />}
                label="الخطة"
                value={
                  <span className="px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-300 border border-brand-500/30 text-xs font-bold">
                    {sub.status === "trial" ? "تجربة مجانية" : sub.plan.name}
                  </span>
                }
              />
              <Row label="الرسائل المستخدمة" value={`${sub.msgsUsed} / ${sub.plan.monthlyMsgs}`} />
              <Row label="ينتهي في" value={new Date(sub.expiresAt).toLocaleDateString("ar-EG")} />
            </div>
          ) : (
            <div className="text-slate-500 text-sm">لا يوجد اشتراك نشط</div>
          )}
          <button className="btn-primary w-full mt-6">ترقية الخطة</button>
        </div>
      </div>

      <div className="mt-6">
        <Link
          href="/dashboard/settings/ai-provider"
          className="card p-5 flex items-center justify-between hover:bg-white/5 transition group"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-500/10 border border-brand-500/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-brand-300" />
            </div>
            <div>
              <div className="font-bold">مزوّد الذكاء الاصطناعي</div>
              <div className="text-sm text-slate-400 mt-1">
                اشتغل بـ KEYONE AI أو اربط مزوّدك الخاص (OpenAI / Gemini / Claude / Groq / OpenRouter)
              </div>
            </div>
          </div>
          <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:text-slate-200" />
        </Link>
      </div>

      <div className="mt-4">
        <Link
          href="/dashboard/settings/meta-cloud"
          className="card p-5 flex items-center justify-between hover:bg-white/5 transition group"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <div className="font-bold">واتساب — وضع الاتصال</div>
              <div className="text-sm text-slate-400 mt-1">
                اختر QR Code أو Meta Cloud API الرسمي. يضمن استقرار طويل المدى والامتثال لسياسة Meta.
              </div>
            </div>
          </div>
          <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:text-slate-200" />
        </Link>
      </div>

      <div className="mt-4">
        <Link
          href="/dashboard/compliance"
          className="card p-5 flex items-center justify-between hover:bg-white/5 transition group"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="font-bold">صحة الإرسال والامتثال</div>
              <div className="text-sm text-slate-400 mt-1">
                تتبع حالة التسليم، جودة الرقم، الـ webhooks، والقوالب المعتمدة — كله من بيانات حقيقية.
              </div>
            </div>
          </div>
          <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:text-slate-200" />
        </Link>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: any) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <span>{label}</span>
      </div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
