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
    on: process.env.PAYMENTS_MANUAL_ENABLED === "1" || process.env.PAYMENTS_MANUAL_ENABLED === "true",
  },
  {
    key: "SIGNUP_AUTO_APPROVE",
    label: "الموافقة التلقائية على التسجيل",
    description: "يمنح وصول فوري بدون مراجعة يدوية عند التسجيل الذاتي.",
    on: process.env.SIGNUP_AUTO_APPROVE === "1" || process.env.SIGNUP_AUTO_APPROVE === "true",
  },
  {
    key: "WA_SMART_QUEUE_ENABLED",
    label: "طابور QR الذكي",
    description: "يفعّل جدولة سعة جلسات QR بدل التخصيص المباشر.",
    on: process.env.WA_SMART_QUEUE_ENABLED === "1" || process.env.WA_SMART_QUEUE_ENABLED === "true",
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
