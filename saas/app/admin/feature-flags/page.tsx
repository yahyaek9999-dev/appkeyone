/**
 * System feature-flags visibility — platform admin only.
 *
 * KEYONE's system-wide switches (Bridge, Meta Cloud, wallet billing, free-tier
 * enforcement, etc.) are env-var gated by design — each one sits directly in
 * front of money-handling or WhatsApp-routing logic (lib/messaging/feature-flags.ts,
 * lib/wallet/flags.ts, lib/wallet/enforce.ts), so flipping one live without
 * restarting the process risks a half-applied gate mid-request. Making them
 * genuinely live-togglable would mean rewriting each of those gates to read a
 * DB override — exactly the kind of change CLAUDE.md's "never rewrite working
 * systems" / WhatsApp-send-pipeline-approval rule exists to slow down, not
 * something to retrofit in a single pass.
 *
 * What's safe to ship now: real-time visibility into what's actually on/off in
 * this running process, so an admin isn't guessing at .env state. Read-only.
 */

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { scalingFlags } from "@/lib/scaling-flags";
import { actionFlags } from "@/lib/actions/flags";
import { brainFlags } from "@/lib/brain/flags";
import { creditFlags } from "@/lib/credits/flags";
import { qrPoolFlags } from "@/lib/qr-pool/flags";
import { qrQueueFlags } from "@/lib/qr-queue/flags";
import { paymentFlags } from "@/lib/payments/flags";

export const dynamic = "force-dynamic";

const FLAGS: { key: string; label: string; description: string; on: boolean }[] = [
  {
    key: "BRIDGE_ENABLED",
    label: "بروتوكول Bridge",
    description: "يفعّل مسار ربط الأجهزة عبر Bridge (RFC 8628 device grant).",
    on: process.env.BRIDGE_ENABLED === "1" || process.env.BRIDGE_ENABLED === "true",
  },
  {
    key: "META_CLOUD_ENABLED",
    label: "مسار Meta Cloud",
    description: "المفتاح العام لتوجيه الرسائل عبر Meta Cloud API بدل QR (يحتاج أيضاً باقة مؤهّلة + توكن).",
    on: process.env.META_CLOUD_ENABLED === "1",
  },
  {
    key: "WALLET_BILLING_ENABLED",
    label: "فوترة المحفظة",
    description: "يفعّل خصم تكلفة محادثات Meta من محفظة التاجر.",
    on: process.env.WALLET_BILLING_ENABLED === "1" || process.env.WALLET_BILLING_ENABLED === "true",
  },
  {
    key: "WALLET_ENFORCE_SENDS",
    label: "منع الإرسال عند نفاد الرصيد",
    description: "يوقف إرسال الرسائل فعلياً لو رصيد المحفظة سالب (يحتاج WALLET_BILLING_ENABLED أيضاً).",
    on: process.env.WALLET_ENFORCE_SENDS === "1",
  },
  {
    key: "FREE_TIER_ENFORCEMENT",
    label: "تطبيق حدود الباقة المجانية",
    description: "يفعّل إنفاذ حدود الرسائل/الميزات لحسابات الباقة المجانية.",
    on: process.env.FREE_TIER_ENFORCEMENT === "1" || process.env.FREE_TIER_ENFORCEMENT === "true",
  },
  {
    key: "CUSTOMER_CAP_ENFORCEMENT",
    label: "تطبيق حدّ عدد العملاء",
    description: "يفعّل إنفاذ الحدّ الأقصى لعدد العملاء لكل باقة.",
    on: process.env.CUSTOMER_CAP_ENFORCEMENT === "1" || process.env.CUSTOMER_CAP_ENFORCEMENT === "true",
  },
  {
    key: "PAYMENTS_MANUAL_ENABLED",
    label: "الدفع اليدوي",
    description: "يفعّل مسار رفع إثبات الدفع اليدوي (تحويل بنكي/محفظة).",
    // Default-ON: the consumer is paymentFlags.manualEnabled ("ON unless
    // explicitly disabled"). Comparing against "1" reported this money path
    // as OFF whenever the var was simply unset.
    on: paymentFlags.manualEnabled,
  },
  {
    key: "SIGNUP_AUTO_APPROVE",
    label: "الموافقة التلقائية على التسجيل",
    description: "يمنح وصول فوري بدون مراجعة يدوية عند التسجيل الذاتي.",
    // Default-ON: app/api/auth/signup/route.ts gates on `!== "0"`, so an unset
    // var means signups ARE auto-approved. The old `=== "1"` check displayed
    // the opposite of the running behaviour.
    on: process.env.SIGNUP_AUTO_APPROVE !== "0",
  },
  {
    key: "WA_SMART_QUEUE_ENABLED",
    label: "طابور QR الذكي",
    description: "يفعّل جدولة سعة جلسات QR بدل التخصيص المباشر.",
    // Default-ON: lib/wa.ts gates on `!== "0"`.
    on: process.env.WA_SMART_QUEUE_ENABLED !== "0",
  },
  // Scaling optimizations (lib/scaling-flags.ts) — all default OFF, opt-in per box.
  {
    key: "ENABLE_SESSION_HIBERNATION",
    label: "إسبات الجلسات الذكي",
    description: "ينيّم جلسات واتساب الخاملة ويوقظها عند الحاجة لتقليل استهلاك الموارد.",
    on: scalingFlags.sessionHibernation,
  },
  {
    key: "ENABLE_SNAPSHOT_CACHE",
    label: "تخزين لقطة SSE مؤقتاً",
    description: "يشارك لقطة الحالة اللحظية بين الطلبات بدل إعادة حسابها لكل عميل.",
    on: scalingFlags.snapshotCache,
  },
  {
    key: "ENABLE_MESSAGE_COALESCING",
    label: "دمج الرسائل المتتالية",
    description: "يجمع رسائل العميل المتتالية السريعة قبل تمريرها للذكاء الاصطناعي.",
    on: scalingFlags.messageCoalescing,
  },
  {
    key: "ENABLE_CHROMIUM_OPTIMIZATION",
    label: "تحسين موارد Chromium",
    description: "يعطّل تحميل الصور/الوسائط/التتبّع داخل متصفح جلسة واتساب لتوفير الموارد.",
    on: scalingFlags.chromiumOptimization,
  },
  {
    key: "ENABLE_BACKGROUND_OFFLOADING",
    label: "تفريغ المهام الخلفية",
    description: "يجمّع الكتابات غير الحرجة لقاعدة البيانات في دفعات بدل الكتابة الفورية.",
    on: scalingFlags.backgroundOffloading,
  },
  {
    key: "WA_AI_REGISTRY_ENABLED",
    label: "سجل مزوّدي الذكاء الموحّد لواتساب",
    description: "يوجّه ردّ الذكاء الاصطناعي الحيّ عبر سجل المزوّدين الموحّد (vault ← legacy ← keyone) بدل المسار القديم مباشرة.",
    on: scalingFlags.waAiRegistry,
  },
  // Action Engine (lib/actions/flags.ts)
  {
    key: "ACTION_ENGINE_ENABLED",
    label: "محرّك الإجراءات",
    description: "يفعّل اقتراح/تسجيل إجراءات محرّك الأتمتة (لا ينفّذ تعديلات فعلية إلا مع ACTION_ENGINE_EXECUTE).",
    on: actionFlags.enabled,
  },
  {
    key: "ACTION_ENGINE_EXECUTE",
    label: "تنفيذ إجراءات المحرّك فعلياً",
    description: "يسمح لمحرّك الإجراءات بتنفيذ تعديلات حقيقية بدل مجرّد اقتراحها.",
    on: actionFlags.execute,
  },
  // Brain (lib/brain/flags.ts)
  {
    key: "BRAIN_ENABLED",
    label: "طبقة الدماغ (Brain)",
    description: "المفتاح الرئيسي لطبقة Brain المعرفية.",
    on: brainFlags.enabled,
  },
  {
    key: "BRAIN_CREDITS_ENABLED",
    label: "استهلاك رصيد Brain",
    description: "عند التفعيل، تستهلك استدعاءات Brain رصيداً وتُرفض عند نفاده (402).",
    on: brainFlags.creditsEnabled,
  },
  {
    key: "BRAIN_MONTHLY_CREDITS_ENABLED",
    label: "منح رصيد Brain الشهري",
    description: "يفعّل مهمة الكرون الشهرية لمنح رصيد Brain حسب الباقة.",
    on: brainFlags.monthlyEnabled,
  },
  // Broadcast credits (lib/credits/flags.ts)
  {
    key: "BROADCAST_CREDITS_ENFORCE",
    label: "إنفاذ رصيد حملات البث",
    description: "يمنع إنشاء حملة بث جديدة عند عدم كفاية الرصيد.",
    on: creditFlags.enforce,
  },
  {
    key: "BROADCAST_MONTHLY_CREDITS_ENABLED",
    label: "منح رصيد الحملات الشهري",
    description: "يفعّل مهمة الكرون الشهرية لمنح رصيد حملات البث حسب الباقة.",
    on: creditFlags.monthlyEnabled,
  },
  // QR pool + queue (lib/qr-pool/flags.ts, lib/qr-queue/flags.ts)
  {
    key: "QR_SCHEDULER_ENABLED",
    label: "جدولة مسارات QR المشتركة",
    description: "المفتاح الرئيسي لمجدول مسارات QR الذي يحجز سعة Smart QR Pool الحالية.",
    on: qrPoolFlags.schedulerEnabled,
  },
  {
    key: "QR_QUEUE_ENABLED",
    label: "منصّة طابور حجز QR",
    description: "يسمح للتاجر بحجز فترة على سعة جلسات QR المحدودة.",
    on: qrQueueFlags.enabled,
  },
  {
    key: "QR_QUEUE_WAKE_ON_ACTIVATE",
    label: "إيقاظ الجلسة عند تفعيل الحجز",
    description: "يوقظ جلسة واتساب الخاصة بالتاجر تلقائياً عند بدء فترة الحجز المؤكّدة.",
    on: qrQueueFlags.wakeOnActivate,
  },
];

export default function AdminFeatureFlagsPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="page-title mb-1">مفاتيح النظام</h1>
        <p className="page-desc">
          الحالة الفعلية الآن على السيرفر الحالي. هذه المفاتيح مقصود أنها env-based (وليست live-toggle) لأنها بوابات مباشرة
          أمام مسارات المال والإرسال — تغييرها يحتاج تعديل .env وإعادة تشغيل الخدمة، مش زر هنا.
        </p>
      </div>

      <div className="space-y-2">
        {FLAGS.map((f) => (
          <div key={f.key} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">{f.label}</span>
                <span className="font-mono text-[11px] text-slate-500" dir="ltr">{f.key}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">{f.description}</p>
            </div>
            <span
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                f.on ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-400"
              }`}
            >
              {f.on ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
              {f.on ? "مفعّل" : "متوقف"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
