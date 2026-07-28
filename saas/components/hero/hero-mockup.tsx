// Hand-built product mockup for the hero — WhatsApp chat panel + KPI dashboard.
// Pure JSX/SVG: no AI-generated imagery, no client state required.

import type { ReactNode } from "react";

type Props = { locale?: string };

export default function HeroMockup({ locale }: Props) {
  const isAr = locale === "ar";

  return (
    <div
      className="relative mx-auto w-full max-w-[1120px]"
      aria-label={isAr ? "معاينة واجهة KEYONE" : "KEYONE product interface preview"}
      role="img"
    >
      <div
        className="relative grid grid-cols-1 gap-3 rounded-[22px] border border-white/[0.06] bg-[#0b0f0e]/85 p-3 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur-xl md:grid-cols-[minmax(0,1.05fr)_minmax(0,1.4fr)]"
        style={{ animation: "lp-hero-float 8s ease-in-out infinite" }}
      >
        {/* ── Chat panel ─────────────────────────────────────── */}
        <div className="flex h-[420px] flex-col overflow-hidden rounded-[16px] border border-white/[0.05] bg-[#0d1413]/90 sm:h-[460px]">
          <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/15 text-brand-400">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-3.5-7.1L21 4l-1 3.5A9 9 0 0 1 21 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M8.5 12.5c1 2 2.5 3.2 4.5 4l1.4-1.4c.3-.3.7-.4 1.1-.2l2 .9M8.5 12.5 7.3 11c-.2-.4-.2-.8 0-1.1L8.5 8.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white/90">
                  {isAr ? "عميل جديد — طلب #12345" : "New Customer — Order #12345"}
                </p>
                <p className="text-[0.68rem] text-slate-400">WhatsApp · online</p>
              </div>
            </div>
            <div className="hidden items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[0.65rem] text-slate-400 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
              KEYONE AI · Auto-reply
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-hidden px-4 py-4" dir={isAr ? "rtl" : "ltr"}>
            <ChatBubble side="in" time="10:42">
              {isAr ? "أعيز أعرف سعر المنتج وإمتى هيوصل" : "Hi — can I check the status of my order?"}
            </ChatBubble>
            <ChatBubble side="out" time="10:42">
              {isAr ? "أهلاً بيك! 👋 طلبك #12345 اتشحن وهيوصل بكرة. بعتلك رابط التتبع." : "Hello 👋 Happy to help. Could you share your order number?"}
            </ChatBubble>
            <ChatBubble side="in" time="10:43">
              {isAr ? "تمام، شكراً جزيلاً ✅" : "Sure, it's #12345"}
            </ChatBubble>
            <ChatBubble side="out" time="10:43">
              {isAr ? "أي خدمة! هل تحتاج إي حاجة تانية؟" : "Order #12345 has shipped and arrives tomorrow. I've sent your tracking link."}
            </ChatBubble>
          </div>

          <div className="border-t border-white/[0.05] px-4 py-3">
            <div className="flex items-center gap-3 rounded-full border border-white/[0.05] bg-white/[0.02] px-4 py-2 text-xs text-slate-400">
              <span className="flex-1">{isAr ? "اكتب رسالة…" : "Type a message…"}</span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white">
                <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" aria-hidden="true">
                  <path d="M4 20 20 12 4 4l3 8-3 8Z" fill="currentColor" />
                </svg>
              </span>
            </div>
          </div>
        </div>

        {/* ── Dashboard panel ─────────────────────────────────── */}
        <div className="flex h-[420px] flex-col gap-3 rounded-[16px] border border-white/[0.05] bg-[#0d1413]/90 p-4 sm:h-[460px] sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.24em] text-slate-400/80">
                {isAr ? "نظرة عامة · هذا الشهر" : "Overview · this month"}
              </p>
              <p className="mt-1 text-sm font-medium text-white/90">
                {isAr ? "عمليات العملاء" : "Customer operations"}
              </p>
            </div>
            <div className="hidden items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[0.65rem] text-slate-400 sm:flex">
              {isAr ? "1 – 31 مايو" : "May 1 – May 31"}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <StatCell label={isAr ? "الإيرادات" : "Revenue"} value="$128K" delta="+24.6%" />
            <StatCell label={isAr ? "الطلبات" : "Orders"} value="1,842" delta="+18.3%" />
            <StatCell label={isAr ? "العملاء" : "Customers"} value="1,248" delta="+12.1%" />
            <StatCell label={isAr ? "الأتمتة" : "Automation"} value="98.5%" delta="+8.7%" />
          </div>

          <div className="flex-1 overflow-hidden rounded-[12px] border border-white/[0.04] bg-black/25 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="text-white/85">{isAr ? "الإيرادات" : "Revenue"}</span>
              <span className="text-[0.65rem]">$0 – $150K</span>
            </div>
            <RevenueChart />
          </div>

          <div className="grid grid-cols-3 gap-2 text-[0.7rem]">
            <OrderRow order="#12345" name={isAr ? "عميل 1" : "Olivia Rhye"} status={isAr ? "مُشحون" : "Shipped"} tone="shipped" />
            <OrderRow order="#12344" name={isAr ? "عميل 2" : "Phoenix Baker"} status={isAr ? "قيد المعالجة" : "Processing"} tone="processing" />
            <OrderRow order="#12343" name={isAr ? "عميل 3" : "Lana Steiner"} status={isAr ? "تم التسليم" : "Delivered"} tone="delivered" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({
  side,
  time,
  children,
}: {
  side: "in" | "out";
  time: string;
  children: ReactNode;
}) {
  const isOut = side === "out";
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[78%] rounded-2xl px-3.5 py-2 text-[0.82rem] leading-snug ${
          isOut
            ? "bg-brand-500/20 text-white/95"
            : "bg-white/[0.04] text-white/85"
        }`}
      >
        {children}
        <span className="mt-1 block text-right text-[0.6rem] text-slate-400/70">{time}</span>
      </div>
    </div>
  );
}

function StatCell({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div className="rounded-[10px] border border-white/[0.04] bg-black/25 px-3 py-2.5">
      <p className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-400/70">{label}</p>
      <p className="mt-1.5 text-[0.95rem] font-semibold text-white">{value}</p>
      <p className="text-[0.62rem] text-brand-400">{delta}</p>
    </div>
  );
}

function RevenueChart() {
  const path =
    "M0,110 C40,105 60,95 90,88 C120,80 140,70 180,60 C220,52 240,58 280,48 C320,38 340,28 380,18 C400,14 420,10 440,6";
  const area = `${path} L440,140 L0,140 Z`;
  return (
    <svg viewBox="0 0 440 140" className="mt-3 h-[calc(100%-1.75rem)] w-full">
      <defs>
        <linearGradient id="rev-fill-kg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#0c7a6c" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#0c7a6c" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#rev-fill-kg)" />
      <path
        d={path}
        fill="none"
        stroke="#2f9384"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="440" cy="6" r="3" fill="#2f9384" />
    </svg>
  );
}

function OrderRow({
  order,
  name,
  status,
  tone,
}: {
  order: string;
  name: string;
  status: string;
  tone: "shipped" | "processing" | "delivered";
}) {
  const cls =
    tone === "shipped"
      ? "text-brand-400 bg-brand-500/12"
      : tone === "processing"
        ? "text-amber-300/85 bg-amber-300/8"
        : "text-white/85 bg-white/[0.05]";
  return (
    <div className="flex items-center justify-between gap-2 rounded-[10px] border border-white/[0.04] bg-black/25 px-3 py-2">
      <div className="min-w-0">
        <p className="text-white/85">{order}</p>
        <p className="truncate text-[0.6rem] text-slate-400">{name}</p>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[0.58rem] ${cls}`}>{status}</span>
    </div>
  );
}
