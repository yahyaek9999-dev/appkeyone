"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ChevronLeft, X, Play } from "lucide-react";
import type { Vertical, ModuleKey } from "@/lib/modules";
import { verticalSteps } from "@/lib/readiness/verticals";

export interface GettingStartedSteps {
  whatsapp: boolean;
  aiBot: boolean;
  knowledge: boolean;
  store: boolean;
  campaign: boolean;
}

interface StepDef {
  key: keyof GettingStartedSteps;
  title: string;
  desc: string;
  href: string;
  cta: string;
  optional?: boolean;
}

const BASE_STEPS: StepDef[] = [
  { key: "whatsapp", title: "اربط واتساب", desc: "امسح كود QR لتفعيل البوت على رقمك.", href: "/dashboard/whatsapp", cta: "ربط" },
  { key: "aiBot", title: "اضبط الإعدادات", desc: "اسم المتجر والأسلوب ورسالة الترحيب.", href: "/dashboard/bot", cta: "ضبط" },
  { key: "knowledge", title: "أضف منتجاتك", desc: "المنتجات، الأسعار، والأسئلة الشائعة.", href: "/dashboard/knowledge", cta: "إضافة" },
  { key: "store", title: "اربط متجرك", desc: "Shopify أو WooCommerce أو Salla أو Zid لمزامنة الطلبات.", href: "/dashboard/integrations", cta: "ربط", optional: true },
  { key: "campaign", title: "أرسل أول حملة", desc: "وصّل عروضك لعملائك عبر رسالة جماعية.", href: "/dashboard/broadcasts", cta: "إرسال" },
];

const STORAGE_KEY = "keyone_getting_started_dismissed";

export function GettingStarted({
  steps,
  vertical,
  modules,
}: {
  steps: GettingStartedSteps;
  /** Optional Business Type — filters/relabels steps. Omit → today's Store behavior. */
  vertical?: Vertical;
  /** Optional live module map — a step whose module is OFF is dropped. */
  modules?: Partial<Record<ModuleKey, boolean>> | null;
}) {
  // Business-Type-aware step list. No prop → full commerce list (unchanged).
  const STEPS = verticalSteps(BASE_STEPS, "gettingStarted", vertical, modules);

  const requiredKeys = STEPS.filter((s) => !s.optional).map((s) => s.key);
  const allRequiredDone = requiredKeys.every((k) => steps[k]);

  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  // Auto-hide once every required step is complete, or if the user dismissed it.
  if (allRequiredDone || dismissed) return null;

  const doneCount = STEPS.filter((s) => steps[s.key]).length;
  const totalCount = STEPS.length;
  const pct = Math.round((doneCount / totalCount) * 100);

  function dismiss() {
    try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    setDismissed(true);
  }

  return (
    <div className="card p-5 border-brand-500/20 bg-gradient-to-br from-brand-500/[0.06] to-transparent">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/15">
            <Play className="h-5 w-5 text-brand-400" />
          </div>
          <div>
            <h2 className="section-title">خطوات البداية</h2>
            <p className="text-xs text-slate-400">أكمل الخطوات لتفعيل المنصة بالكامل</p>
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

      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
          <span>{doneCount} من {totalCount} مكتملة</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="space-y-1">
        {STEPS.map((s) => {
          const done = steps[s.key];
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
                  <span className={`text-sm font-medium ${done ? "text-slate-400 line-through" : "text-white"}`}>
                    {s.title}
                  </span>
                  {s.optional && (
                    <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-500">اختياري</span>
                  )}
                </div>
                {!done && <div className="mt-0.5 truncate text-[11px] text-slate-500">{s.desc}</div>}
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
