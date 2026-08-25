"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Rocket, ArrowLeft, ArrowRight, Check, Loader2,
  ShoppingBag, UtensilsCrossed, Megaphone, Code2, Stethoscope,
  GraduationCap, Briefcase, Building2, Factory, Shapes,
  type LucideIcon,
} from "lucide-react";
import { BUSINESS_TYPES, TONES } from "@/lib/persona-packs";
import { VERTICALS, DEFAULT_VERTICAL, type Vertical } from "@/lib/modules";

type Step = number;

// Maps the lucide icon NAME stored in VERTICALS to the imported component.
const VERTICAL_ICONS: Record<string, LucideIcon> = {
  ShoppingBag, UtensilsCrossed, Megaphone, Code2, Stethoscope,
  GraduationCap, Briefcase, Building2, Factory, Shapes,
};

export default function OnboardingWizard({ userName }: { userName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [brand, setBrand] = useState("");
  const [vertical, setVertical] = useState<Vertical>(DEFAULT_VERTICAL);
  const [businessType, setBusinessType] = useState<string>("general");
  const [tone, setTone] = useState<string>("warm");
  const [notifyPhone, setNotifyPhone] = useState("");
  const [importedText, setImportedText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const next = () => setStep((s) => Math.min(5, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const canAdvance =
    (step === 0 && brand.trim().length >= 2) ||
    (step === 1 && !!vertical) ||
    (step === 2 && !!businessType) ||
    (step === 3 && !!tone) ||
    (step === 4) ||
    step === 5;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch("/api/onboarding/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, vertical, businessType, tone, notifyPhone, importedText }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "request_failed");
      setResult(j);
      // jump to a final success step
      setTimeout(() => router.push("/dashboard/whatsapp"), 1200);
    } catch (e: any) {
      setError(e?.message || "خطأ غير متوقع");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="text-center">
        <div className="ai-badge">
          <Rocket className="w-3 h-3" />
          إعداد سريع · أقل من 5 دقائق
        </div>
        <h1 className="ai-heading mt-3 text-3xl">أهلاً {userName.split("@")[0]} 👋</h1>
        <p className="text-slate-400 mt-2 text-sm">
          كام سؤال بسيط عشان نخلّص إعداد بوت الواتس اب بتاعك. تقدر تغيّر أي حاجة لاحقاً من لوحة التحكم.
        </p>
      </header>

      <ProgressBar step={step} />

      <div className="ai-card p-6 md:p-8">
        {step === 0 && (
          <StepShell
            stepNum={1}
            title="اسم المتجر أو البزنس"
            subtitle="ده اللي البوت هيقدّم نفسه باسمه للعملاء. سيبه بسيط وواضح."
          >
            <input
              autoFocus
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="مثال: ستايل ستور"
              className="input text-lg"
            />
            {brand.trim().length > 0 && brand.trim().length < 2 && (
              <div className="text-xs text-amber-300 mt-2">حرفين على الأقل من فضلك.</div>
            )}
            <label className="block text-xs text-slate-400 mt-4 mb-1">رقم واتساب لإشعارك بالطلبات <span className="opacity-60">(اختياري — تقدر تضيفه بعدين)</span></label>
            <input
              type="text"
              dir="ltr"
              value={notifyPhone}
              onChange={(e) => setNotifyPhone(e.target.value)}
              placeholder="+201xxxxxxxxx"
              className="input text-sm"
            />
            <div className="text-xs text-slate-500 mt-2">
              💡 البوت هيبعت لك على الرقم ده لمّا حد يجيب سيرة دفع أو طلب جديد.
            </div>
          </StepShell>
        )}

        {step === 1 && (
          <StepShell
            stepNum={2}
            title="نوع النشاط"
            subtitle="اختر نوع نشاطك عشان نظبّط لك مساحة العمل — بنفعّل بس الأقسام اللي تخصّك ونخفي اللي مالوش لازمة. تقدر تعدّلها بعدين."
          >
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {VERTICALS.map((v) => {
                const Icon = VERTICAL_ICONS[v.icon] || Shapes;
                return (
                  <button
                    key={v.key}
                    onClick={() => setVertical(v.key)}
                    className={`p-4 rounded-2xl border text-right transition ${
                      vertical === v.key
                        ? "bg-brand-500/15 border-brand-500/40 ring-1 ring-brand-500/40"
                        : "bg-slate-900/30 border-white/5 hover:border-white/15"
                    }`}
                  >
                    <Icon className="w-6 h-6 text-brand-300" />
                    <div className="mt-1 font-medium text-sm">{v.label}</div>
                  </button>
                );
              })}
            </div>
          </StepShell>
        )}

        {step === 2 && (
          <StepShell
            stepNum={3}
            title="نوع البزنس"
            subtitle="بناء عليه بنجهّز لغة الرّدّ وأسئلة شايعة جاهزة تناسبك. لو مش متأكّد، اختر الأقرب."
          >
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {BUSINESS_TYPES.map((b) => (
                <button
                  key={b.value}
                  onClick={() => setBusinessType(b.value)}
                  className={`p-4 rounded-2xl border text-right transition ${
                    businessType === b.value
                      ? "bg-brand-500/15 border-brand-500/40 ring-1 ring-brand-500/40"
                      : "bg-slate-900/30 border-white/5 hover:border-white/15"
                  }`}
                >
                  <div className="text-2xl">{b.icon}</div>
                  <div className="mt-1 font-medium text-sm">{b.label}</div>
                </button>
              ))}
            </div>
          </StepShell>
        )}

        {step === 3 && (
          <StepShell
            stepNum={4}
            title="أسلوب الرد"
            subtitle="لهجة البوت مع العملاء. أي خيار تقدر تغيّره بعد الإعداد."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {TONES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTone(t.value)}
                  className={`p-4 rounded-2xl border text-right transition ${
                    tone === t.value
                      ? "bg-brand-500/15 border-brand-500/40 ring-1 ring-brand-500/40"
                      : "bg-slate-900/30 border-white/5 hover:border-white/15"
                  }`}
                >
                  <div className="font-medium">{t.label}</div>
                  <div className="text-xs text-slate-400 mt-1">{t.subtitle}</div>
                </button>
              ))}
            </div>
          </StepShell>
        )}

        {step === 4 && (
          <StepShell
            stepNum={5}
            title="إلصق معلومات بزنسك (اختياري)"
            subtitle="جّب أي نص فيه منتجات، أسعار، أسئلة شائعة، بيو إنستجرام — إحنا بنفهمه وبنحوّله لردود جاهزة. لو عندك فايل PDF أو Word، تقدر ترفعه لاحقاً من صفحة قاعدة المعرفة."
          >
            <textarea
              value={importedText}
              onChange={(e) => setImportedText(e.target.value)}
              placeholder={`أمثلة:\n\nقميص قطن — 350 جنيه\nبنطلون جينز — 480 جنيه\n\nس: هل بترجعوا الفلوس؟\nج: آه، خلال 7 أيام بشرط الفاتورة.`}
              rows={10}
              className="input resize-none font-mono text-sm"
            />
            <div className="text-xs mt-2 flex items-center justify-between">
              <span className={
                importedText.length === 0 ? "text-slate-500" :
                importedText.length < 50 ? "text-amber-400" :
                importedText.length < 300 ? "text-emerald-400" : "text-emerald-400"
              }>
                {importedText.length === 0
                  ? "💡 تقدر تتخطّى وترجع لها لاحقاً من 'قاعدة المعرفة'."
                  : importedText.length < 50
                    ? `${importedText.length} حرف · النص قصير — حاول تضيف بعض المنتجات والأسعار`
                    : `${importedText.length.toLocaleString()} حرف · جاهز · بنحدّد المنتجات والأسعار والأسئلة تلقائياً`}
              </span>
              {importedText.length > 0 && (
                <button type="button" onClick={() => setImportedText("")} className="text-xs text-slate-500 hover:text-slate-300 underline">
                  مسح
                </button>
              )}
            </div>
          </StepShell>
        )}

        {step === 5 && (
          <StepShell
            stepNum={6}
            title="جاهز للإطلاق"
            subtitle="راجع الإعدادات. بعد ما تدوس 'تفعيل البوت'، هنوديك لصفحة ربط واتساب."
          >
            <ReviewCard
              brand={brand}
              vertical={vertical}
              businessType={businessType}
              tone={tone}
              hasImport={importedText.length > 0}
            />
            {result && (
              <div className="mt-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm">
                <div className="font-semibold flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  تم! اتزرع {result.seeded.documents} ملف معرفة و {result.seeded.quickReplies} ردود سريعة
                  {result.seeded.productsDetected ? ` و${result.seeded.productsDetected} منتج` : ""}.
                </div>
                <div className="text-xs mt-1 opacity-80">جاري التحويل لصفحة ربط واتساب…</div>
              </div>
            )}
            {error && (
              <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm flex items-center justify-between gap-3">
                <div>حصل خلل: {error} — اضغط 'تفعيل البوت' تاني.</div>
                <button onClick={() => setError(null)} className="text-xs underline opacity-70 hover:opacity-100">إخفاء</button>
              </div>
            )}
            {submitting && (
              <div className="mt-4 p-3 rounded-xl bg-slate-500/10 border border-slate-500/30 text-slate-300 text-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                بنجهّز شخصية بوتك، وبنبني قاعدة المعرفة من النص اللي ادخلته…
              </div>
            )}
          </StepShell>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={back}
          disabled={step === 0 || submitting}
          className="ai-btn ai-btn-ghost px-4 py-2 text-sm text-slate-300 disabled:opacity-30"
        >
          <ArrowRight className="w-4 h-4" />
          السابق
        </button>
        {step < 5 ? (
          <button
            onClick={next}
            disabled={!canAdvance}
            className="ai-btn ai-btn-primary px-5 py-2.5 text-sm disabled:opacity-40"
          >
            التالي
            <ArrowLeft className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={submitting || !!result}
            className="ai-btn ai-btn-primary px-5 py-2.5 text-sm disabled:opacity-40"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            {submitting ? "جاري الإعداد…" : result ? "تم" : "تفعيل البوت"}
          </button>
        )}
      </div>
    </div>
  );
}

function ProgressBar({ step }: { step: number }) {
  const total = 6;
  return (
    <div className="flex items-center gap-2" dir="ltr">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition ${
            i <= step ? "bg-gradient-to-r from-brand-500 to-emerald-500" : "bg-white/5"
          }`}
        />
      ))}
    </div>
  );
}

function StepShell({
  stepNum, title, subtitle, children,
}: {
  stepNum?: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        {stepNum && (
          <div className="text-xs text-brand-300 font-bold mb-1">خطوة {stepNum} من 6</div>
        )}
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-slate-400 mt-1 leading-relaxed">{subtitle}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

function ReviewCard({ brand, vertical, businessType, tone, hasImport }: { brand: string; vertical: Vertical; businessType: string; tone: string; hasImport: boolean }) {
  const bt = BUSINESS_TYPES.find((b) => b.value === businessType);
  const tn = TONES.find((t) => t.value === tone);
  const vt = VERTICALS.find((v) => v.key === vertical);
  return (
    <div className="ai-card space-y-3 rounded-2xl p-4">
      <Row label="اسم المتجر" value={brand} />
      <Row label="نوع النشاط" value={vt ? vt.label : vertical} />
      <Row label="نوع البزنس" value={bt ? `${bt.icon} ${bt.label}` : businessType} />
      <Row label="الأسلوب" value={tn ? tn.label : tone} />
      <Row label="استيراد معلومات" value={hasImport ? "نعم" : "لا"} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
