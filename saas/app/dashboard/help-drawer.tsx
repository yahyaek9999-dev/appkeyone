"use client";

// Help & Success Drawer — always-available, in-product guidance.
//
// Phase 2 (Embedded Customer Success): a floating button on every dashboard
// page opens a drawer with CONTEXTUAL help for the current route — what the
// page does, the top things to do, and direct links. No external docs needed.
//
// Pure client component. Route-aware via usePathname(). No data fetching, no
// writes — it only navigates. Content is curated per route with a sensible
// default so new pages still get useful generic help.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LifeBuoy, X, ArrowLeft, Gauge, BookOpen, MessageCircle,
  Rocket, ChevronLeft,
} from "lucide-react";

interface HelpLink {
  label: string;
  href: string;
}
interface HelpTopic {
  title: string;
  summary: string;
  steps: string[];
  links: HelpLink[];
}

// Curated help per route prefix. Longest-prefix match wins, so
// "/dashboard/settings/team" can override "/dashboard/settings".
const HELP: { prefix: string; topic: HelpTopic }[] = [
  {
    prefix: "/dashboard/command-center",
    topic: {
      title: "مركز القيادة الذكي",
      summary: "شاشة واحدة تجمع كل ما تحتاجه لتنمية إيرادك: رؤى، فرص، وإجراءات بضغطة.",
      steps: [
        "راجع التوصيات أعلى الصفحة — كل توصية تشرح ماذا، لماذا، والأثر المتوقع.",
        "اضغط زر الإجراء في أي توصية للانتقال مباشرة لتنفيذها.",
        "تابع العملاء المعرّضين للفقدان وأفضل عملائك من البطاقات الجانبية.",
      ],
      links: [
        { label: "مساعد الإيرادات", href: "/dashboard/revenue-copilot" },
        { label: "استعادة العملاء", href: "/dashboard/recovery" },
      ],
    },
  },
  {
    prefix: "/dashboard/whatsapp",
    topic: {
      title: "ربط واتساب",
      summary: "اربط رقم واتساب الخاص بك لتبدأ الردود التلقائية على عملائك.",
      steps: [
        "افتح واتساب على هاتفك > الأجهزة المرتبطة > ربط جهاز.",
        "امسح رمز QR الظاهر على الشاشة.",
        "انتظر حتى تتحول الحالة إلى «متصل» — ثم جرّب من Playground.",
      ],
      links: [
        { label: "تجربة المحادثة", href: "/dashboard/playground" },
        { label: "إعدادات الردود", href: "/dashboard/bot" },
      ],
    },
  },
  {
    prefix: "/dashboard/knowledge",
    topic: {
      title: "مركز التدريب (المعرفة)",
      summary: "أضف معلومات متجرك: المنتجات، الأسعار، السياسات، والأسئلة الشائعة.",
      steps: [
        "أضف معلومات منتجاتك وأسعارك نصياً أو استورد من رابط/ملف.",
        "كلما زادت المعرفة، زادت دقة الردود التلقائية.",
        "راجع «اقتراحات المعرفة» لسدّ الفجوات التي رصدها النظام.",
      ],
      links: [
        { label: "اقتراحات المعرفة", href: "/dashboard/suggestions" },
        { label: "تجربة المحادثة", href: "/dashboard/playground" },
      ],
    },
  },
  {
    prefix: "/dashboard/broadcasts",
    topic: {
      title: "الإرسال الجماعي",
      summary: "أرسل رسائل مستهدفة لشرائح من عملائك وتابع نسب التفاعل.",
      steps: [
        "اختر الشريحة المستهدفة (أو أنشئ شريحة جديدة).",
        "اكتب رسالتك — يُفضّل تخصيصها وتجنّب الإرسال المكثّف لحماية رقمك.",
        "راجع التقرير بعد الإرسال لقياس الردود والتحويل.",
      ],
      links: [
        { label: "شرائح العملاء", href: "/dashboard/segments" },
        { label: "استعادة العملاء", href: "/dashboard/recovery" },
      ],
    },
  },
  {
    prefix: "/dashboard/automations",
    topic: {
      title: "الأتمتة",
      summary: "اضبط قواعد «إذا حدث كذا، نفّذ كذا» لأتمتة المتابعات والإشعارات.",
      steps: [
        "اختر المُحفّز (حدث الطلب، تغيّر النقاط، خمول العميل…).",
        "حدّد الإجراء (متابعة، وسم، إشعار…).",
        "فعّل القاعدة وراقب سجل التنفيذ للتأكد من عملها.",
      ],
      links: [
        { label: "تكاملات التجارة", href: "/dashboard/integrations" },
        { label: "مراقبة النظام", href: "/dashboard/system-health" },
      ],
    },
  },
  {
    prefix: "/dashboard/integrations",
    topic: {
      title: "تكاملات التجارة",
      summary: "اربط متجرك (Shopify/WooCommerce…) لمزامنة الطلبات والمنتجات تلقائياً.",
      steps: [
        "اختر منصة متجرك وأدخل بيانات الربط المطلوبة.",
        "فعّل التكامل وتأكد من وصول أول حدث (webhook).",
        "راجع الطلبات للتأكد من المزامنة الصحيحة.",
      ],
      links: [
        { label: "الطلبات", href: "/dashboard/orders" },
        { label: "مراقبة النظام", href: "/dashboard/system-health" },
      ],
    },
  },
  {
    prefix: "/dashboard/system-health",
    topic: {
      title: "مراقبة النظام",
      summary: "تابع صحة كل نظام فرعي (قاعدة البيانات، واتساب، الطابور، الذكاء، Redis، العامل).",
      steps: [
        "البطاقات الملوّنة تعرض حالة كل نظام: سليم / متدهور / متوقف.",
        "أي حالة «متدهور» تعني أن النظام يعمل لكنه يحتاج مراجعة.",
        "تُحدّث الصفحة تلقائياً كل 30 ثانية.",
      ],
      links: [{ label: "استخدام الباقة", href: "/dashboard/usage" }],
    },
  },
];

const DEFAULT_TOPIC: HelpTopic = {
  title: "مركز المساعدة",
  summary: "كل ما تحتاجه لإدارة متجرك موجود داخل المنصة. ابدأ من مركز القيادة لرؤية أهم الإجراءات.",
  steps: [
    "أكمل خطوات التفعيل من الصفحة الرئيسية للوصول لأول قيمة بسرعة.",
    "اربط واتساب وأضف معلومات متجرك لتحسين الردود التلقائية.",
    "تابع مركز القيادة يومياً لأهم الفرص والتوصيات.",
  ],
  links: [
    { label: "مركز القيادة الذكي", href: "/dashboard/command-center" },
    { label: "ربط واتساب", href: "/dashboard/whatsapp" },
  ],
};

function topicFor(pathname: string): HelpTopic {
  let best: { len: number; topic: HelpTopic } | null = null;
  for (const h of HELP) {
    if (pathname.startsWith(h.prefix) && (!best || h.prefix.length > best.len)) {
      best = { len: h.prefix.length, topic: h.topic };
    }
  }
  return best?.topic ?? DEFAULT_TOPIC;
}

export default function HelpDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const topic = topicFor(pathname || "");

  // Close on Escape; lock nothing else so the page stays usable.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Floating trigger — bottom-start (RTL: bottom-right visually) */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/15 px-4 py-2.5 text-sm font-medium text-brand-200 shadow-lg shadow-brand-500/10 backdrop-blur transition hover:bg-brand-500/25"
        aria-label="فتح مركز المساعدة"
      >
        <LifeBuoy className="h-4 w-4" />
        <span className="hidden sm:inline">مساعدة</span>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Drawer — slides from the start edge (RTL: right) */}
          <aside
            className="fixed inset-y-0 left-0 z-50 flex w-full max-w-sm flex-col border-l border-white/10 bg-[#060b09] shadow-2xl"
            role="dialog"
            aria-label="مركز المساعدة"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] p-4">
              <div className="flex items-center gap-2">
                <LifeBuoy className="h-5 w-5 text-brand-400" />
                <span className="font-semibold text-white">مركز المساعدة</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* Contextual topic */}
              <div>
                <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-brand-400">
                  <Gauge className="h-3.5 w-3.5" /> هذه الصفحة
                </div>
                <h3 className="text-base font-semibold text-white">{topic.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{topic.summary}</p>
              </div>

              {/* Steps */}
              <div>
                <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  <Rocket className="h-3.5 w-3.5" /> خطوات سريعة
                </div>
                <ol className="space-y-2">
                  {topic.steps.map((s, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-slate-300">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-[11px] font-bold text-brand-300">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed">{s}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Quick links */}
              {topic.links.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    <BookOpen className="h-3.5 w-3.5" /> روابط مفيدة
                  </div>
                  <div className="space-y-1.5">
                    {topic.links.map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-sm text-slate-200 transition hover:border-brand-500/25 hover:bg-brand-500/[0.06]"
                      >
                        <span>{l.label}</span>
                        <ChevronLeft className="h-4 w-4 text-slate-500" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer — always-available primary path */}
            <div className="border-t border-white/[0.06] p-4">
              <Link
                href="/dashboard/command-center"
                onClick={() => setOpen(false)}
                className="btn-primary flex w-full items-center justify-center gap-2 text-sm"
              >
                <Gauge className="h-4 w-4" />
                افتح مركز القيادة
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-500">
                <MessageCircle className="h-3 w-3" />
                كل الإرشادات داخل المنتج — لا حاجة لأي دليل خارجي
              </p>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
