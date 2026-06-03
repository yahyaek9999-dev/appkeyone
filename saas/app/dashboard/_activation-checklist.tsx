"use client";

// Activation Checklist — guided first-value journey for new merchants.
//
// Reads the MilestoneStatus returned by syncUserMilestones() (called in the
// dashboard page server component) and renders a shrinking task list. Each
// step links directly to the action that completes it. Disappears when every
// required step is reached. Persists dismiss state in localStorage so power
// users can hide it after activation.
//
// Additive only — displayed above the existing GettingStarted widget (which
// handles the 5-step onboarding checklist). This widget is milestone-driven
// (real data) whereas GettingStarted is heuristic-driven (existing flags).

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ChevronLeft, X, Sparkles, ArrowLeft } from "lucide-react";
import type { MilestoneStatus, ActivationMilestone } from "@/lib/activation/track";

interface ChecklistStep {
  key: ActivationMilestone;
  title: string;
  desc: string;
  href: string;
  cta: string;
  required: boolean;
}

const STEPS: ChecklistStep[] = [
  {
    key: "signed_up",
    title: "إنشاء الحساب",
    desc: "مرحباً! حسابك جاهز.",
    href: "/dashboard",
    cta: "تم",
    required: true,
  },
  {
    key: "onboarding_completed",
    title: "إعداد البوت",
    desc: "حدّد اسم متجرك وأسلوب الرد وأضف معلومات منتجاتك.",
    href: "/dashboard/bot",
    cta: "إعداد",
    required: true,
  },
  {
    key: "whatsapp_connected",
    title: "ربط واتساب",
    desc: "امسح QR code في 30 ثانية لتفعيل البوت على رقمك.",
    href: "/dashboard/whatsapp",
    cta: "ربط",
    required: true,
  },
  {
    key: "first_ai_reply_sent",
    title: "أول رد آلي",
    desc: "جرّب البوت من الـ Playground أو انتظر أول رسالة من عميل.",
    href: "/dashboard/playground",
    cta: "تجربة",
    required: true,
  },
  {
    key: "first_order_extracted",
    title: "أول طلب",
    desc: "البوت بيرصد طلبات الشراء تلقائياً من المحادثات.",
    href: "/dashboard/orders",
    cta: "الطلبات",
    required: false,
  },
  {
    key: "first_broadcast_sent",
    title: "أول حملة إرسال جماعي",
    desc: "ابعت رسالة لعملائك وشوف نسب التفاعل.",
    href: "/dashboard/broadcasts",
    cta: "إرسال",
    required: false,
  },
];

const DISMISS_KEY = "keyone_activation_checklist_dismissed";

export default function ActivationChecklist({
  milestones,
}: {
  milestones: MilestoneStatus;
}) {
  const requiredDone = STEPS.filter((s) => s.required).every(
    (s) => milestones.reached[s.key],
  );
  const allDone = STEPS.every((s) => milestones.reached[s.key]);

  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  });

  // Hide when all required steps done + user dismissed, or when truly all done.
  if (allDone || (requiredDone && dismissed)) return null;
  if (dismissed) return null;

  const doneCount = STEPS.filter((s) => milestones.reached[s.key]).length;
  const pct = Math.round((doneCount / STEPS.length) * 100);

  // First incomplete required step = the primary CTA.
  const nextRequired = STEPS.find((s) => s.required && !milestones.reached[s.key]);

  function dismiss() {
    try { window.localStorage.setItem(DISMISS_KEY, "1"); } catch {}
    setDismissed(true);
  }

  return (
    <div className="card border-brand-500/20 bg-gradient-to-br from-brand-500/[0.07] to-transparent p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/15">
            <Sparkles className="h-5 w-5 text-brand-400" />
          </div>
          <div>
            <h2 className="section-title">خطوات التفعيل</h2>
            <p className="text-xs text-slate-400">
              {doneCount} من {STEPS.length} مكتملة — أكمل الخطوات للوصول لأول قيمة
            </p>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
          title="إخفاء"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
          <span>{doneCount} من {STEPS.length}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
          <div
            className="h-full rounded-full bg-gradient-to-l from-brand-500 to-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Next required CTA (prominent) */}
      {nextRequired && (
        <Link
          href={nextRequired.href}
          className="mb-4 flex items-center gap-3 rounded-xl border border-brand-500/30 bg-brand-500/10 p-3 transition hover:bg-brand-500/15"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/20">
            <ArrowLeft className="h-4 w-4 text-brand-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-brand-200">{nextRequired.title}</div>
            <div className="text-xs text-slate-400">{nextRequired.desc}</div>
          </div>
          <span className="btn-primary shrink-0 px-3 py-1.5 text-xs">{nextRequired.cta}</span>
        </Link>
      )}

      {/* All steps list */}
      <div className="space-y-1">
        {STEPS.map((s) => {
          const done = milestones.reached[s.key];
          const isNext = s.key === nextRequired?.key;
          if (isNext) return null; // already shown prominently above
          return (
            <div
              key={s.key}
              className="flex items-center gap-3 rounded-xl p-2.5 transition hover:bg-white/[0.03]"
            >
              {done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-400" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-slate-600" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${
                      done ? "text-slate-400 line-through" : "text-white"
                    }`}
                  >
                    {s.title}
                  </span>
                  {!s.required && (
                    <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-500">
                      اختياري
                    </span>
                  )}
                </div>
                {!done && (
                  <div className="mt-0.5 truncate text-[11px] text-slate-500">{s.desc}</div>
                )}
              </div>
              {!done && (
                <Link href={s.href} className="btn-ghost shrink-0 px-3 py-1.5 text-xs">
                  {s.cta}
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
