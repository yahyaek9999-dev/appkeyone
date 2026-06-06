"use client";

/**
 * Reusable upgrade modal. Triggered when a user hits a limit or a locked
 * feature. Shows: contextual headline, ROI line, current → recommended tier
 * comparison, and a CTA to the pricing page. Bilingual, RTL-aware,
 * glassmorphism. Pure presentation — parent controls open/variant.
 */

import { useEffect } from "react";
import Link from "next/link";
import { X, Sparkles, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { getTier } from "@/lib/pricing/catalog";

export type UpgradeVariant =
  | "broadcast_limit"
  | "team_limit"
  | "whatsapp_limit"
  | "analytics_locked"
  | "automation_locked"
  | "kb_locked"
  | "generic";

interface VariantCopy {
  title: { ar: string; en: string };
  body: { ar: string; en: string };
  roi: { ar: string; en: string };
}

const COPY: Record<UpgradeVariant, VariantCopy> = {
  broadcast_limit: {
    title: { ar: "وصلت لحد حملات البثّ", en: "Broadcast limit reached" },
    body: { ar: "استنفدت حملات البثّ لهذا الشهر. رقِّ باقتك لإرسال حملات أكثر.", en: "You've used all broadcasts this month. Upgrade to send more." },
    roi: { ar: "حملة واحدة قد تصل لمئات العملاء في دقيقة — استثمار يردّ نفسه من أول طلب.", en: "One broadcast can reach hundreds in a minute — it pays for itself on the first order." },
  },
  team_limit: {
    title: { ar: "وصلت لحد أعضاء الفريق", en: "Team limit reached" },
    body: { ar: "باقتك الحالية وصلت لأقصى عدد أعضاء. رقِّ لإضافة المزيد.", en: "Your plan reached its team-member cap. Upgrade to add more." },
    roi: { ar: "كل عضو إضافي = ردود أسرع وعملاء أكثر سعادة.", en: "Every extra seat = faster replies and happier customers." },
  },
  whatsapp_limit: {
    title: { ar: "وصلت لحد أرقام واتساب", en: "WhatsApp number limit reached" },
    body: { ar: "لربط رقم واتساب إضافي، رقِّ باقتك.", en: "Upgrade to connect another WhatsApp number." },
    roi: { ar: "أرقام متعدّدة = فصل الأقسام وتغطية أوسع لعملائك.", en: "Multiple numbers = separate departments and wider coverage." },
  },
  analytics_locked: {
    title: { ar: "التحليلات المتقدّمة مقفلة", en: "Advanced analytics locked" },
    body: { ar: "التحليلات المتقدّمة متاحة في باقة Pro فأعلى.", en: "Advanced analytics is available on Pro and above." },
    roi: { ar: "اعرف من أين تأتي مبيعاتك بالضبط — وضاعف ما ينجح.", en: "Know exactly where your sales come from — and double down." },
  },
  automation_locked: {
    title: { ar: "الأتمتة المتقدّمة مقفلة", en: "Advanced automations locked" },
    body: { ar: "الأتمتة المتقدّمة متاحة في باقة Growth فأعلى.", en: "Advanced automations are available on Growth and above." },
    roi: { ar: "الأتمتة توفّر ساعات يومياً وتمنع ضياع أي عميل.", en: "Automation saves hours daily and stops leads slipping away." },
  },
  kb_locked: {
    title: { ar: "قاعدة المعرفة مقفلة", en: "Knowledge Base locked" },
    body: { ar: "قاعدة المعرفة والمساعد الذكي متاحان في باقة Pro فأعلى.", en: "Knowledge Base & Smart Assistant are on Pro and above." },
    roi: { ar: "ردود أدقّ من كتالوجك = تحويلات أعلى وأخطاء أقل.", en: "Accurate answers from your catalog = higher conversions, fewer mistakes." },
  },
  generic: {
    title: { ar: "هذه الميزة تحتاج ترقية", en: "This feature needs an upgrade" },
    body: { ar: "رقِّ باقتك لفتح هذه الميزة والمزيد.", en: "Upgrade your plan to unlock this feature and more." },
    roi: { ar: "كل ترقية تفتح أدوات تزيد مبيعاتك وتوفّر وقتك.", en: "Every upgrade unlocks tools that grow sales and save time." },
  },
};

export default function UpgradeModal({
  open,
  onClose,
  variant = "generic",
  recommendedTier,
  currentPlanName,
  locale = "ar",
}: {
  open: boolean;
  onClose: () => void;
  variant?: UpgradeVariant;
  recommendedTier?: string | null;
  currentPlanName?: string;
  locale?: "ar" | "en";
}) {
  const lang = locale === "ar" ? "ar" : "en";
  const isRtl = locale === "ar";
  const Arrow = isRtl ? ArrowLeft : ArrowRight;
  const copy = COPY[variant] ?? COPY.generic;
  const tier = recommendedTier ? getTier(recommendedTier) : undefined;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      dir={isRtl ? "rtl" : "ltr"}
      role="dialog"
      aria-modal="true"
    >
      {/* backdrop */}
      <button
        aria-label="close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
      />
      {/* card */}
      <div className="relative w-full max-w-md animate-slide-up overflow-hidden rounded-2xl border border-white/10 bg-canvas-raised/95 p-6 shadow-2xl backdrop-blur-xl">
        <button
          onClick={onClose}
          className="absolute end-4 top-4 text-slate-500 transition hover:text-white"
          aria-label="close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/15">
          <Sparkles className="h-6 w-6 text-brand-300" />
        </div>

        <h3 className="text-lg font-bold text-white">{copy.title[lang]}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{copy.body[lang]}</p>

        <div className="mt-4 rounded-xl border border-brand-500/20 bg-brand-500/[0.06] p-3 text-[13px] leading-relaxed text-brand-100/90">
          💡 {copy.roi[lang]}
        </div>

        {/* current → recommended */}
        {tier && (
          <div className="mt-4 flex items-center justify-center gap-3 text-sm">
            {currentPlanName && (
              <span className="rounded-lg border border-white/10 px-3 py-1.5 text-slate-400">
                {currentPlanName}
              </span>
            )}
            <Arrow className="h-4 w-4 text-slate-500" />
            <span className="inline-flex items-center gap-1 rounded-lg border border-brand-500/40 bg-brand-500/15 px-3 py-1.5 font-semibold text-brand-200">
              <Check className="h-3.5 w-3.5" />
              {tier.name[lang]}
              {tier.priceUsdMonthly != null && (
                <span className="text-xs font-normal text-brand-300/80">
                  ${tier.priceUsdMonthly}/{locale === "ar" ? "شهر" : "mo"}
                </span>
              )}
            </span>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href={`/pricing?lang=${locale}#plans`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 hover:shadow-[0_6px_24px_-6px_rgba(104,114,212,0.8)]"
          >
            {locale === "ar" ? "عرض الباقات والترقية" : "View plans & upgrade"}
            <Arrow className="h-4 w-4" />
          </Link>
          <button
            onClick={onClose}
            className="w-full rounded-xl px-4 py-2 text-sm text-slate-500 transition hover:text-slate-300"
          >
            {locale === "ar" ? "لاحقاً" : "Maybe later"}
          </button>
        </div>
      </div>
    </div>
  );
}
