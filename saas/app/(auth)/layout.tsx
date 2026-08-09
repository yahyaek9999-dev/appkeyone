import { getSiteConfig } from "@/lib/admin";
import { MaintenanceBanner } from "@/components/ui/maintenance-banner";
import Link from "next/link";
import Image from "next/image";

async function getSiteConfigSafe() {
  try {
    return await getSiteConfig();
  } catch {
    return { brandName: "KEYONE", maintenanceMode: false, maintenanceMessage: null, supportWhatsapp: null, supportEmail: null };
  }
}

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cfg = await getSiteConfigSafe();
  const brand = cfg.brandName || "KEYONE";

  return (
    <div className="relative min-h-screen bg-canvas flex overflow-hidden">
      {cfg.maintenanceMode ? (
        <div className="fixed inset-x-0 top-0 z-30">
          <MaintenanceBanner message={(cfg as any).maintenanceMessage} />
        </div>
      ) : null}

      {/* ── Left brand panel (desktop only) ─────────────────────────── */}
      <div className="hidden lg:flex lg:w-[46%] xl:w-[42%] relative flex-col shrink-0 overflow-hidden">
        {/* Multi-layer ambient */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-canvas-deep" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_30%_45%,rgba(12,122,108,0.22),transparent_70%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_75%_85%,rgba(201,162,75,0.07),transparent_60%)]" />
        </div>

        {/* Diagonal texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.022]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg,rgba(255,255,255,1) 0,rgba(255,255,255,1) 1px,transparent 0,transparent 50%)",
            backgroundSize: "18px 18px",
          }}
        />

        {/* Vertical hairline on the split edge */}
        <div className="absolute inset-y-0 end-0 w-px bg-gradient-to-b from-transparent via-white/[0.07] to-transparent" />

        {/* Panel content */}
        <div className="relative z-10 flex h-full flex-col p-10 xl:p-14">
          {/* Logo mark */}
          <Link href="/" className="flex items-center gap-3 group w-fit">
            <div className="relative h-11 w-11 overflow-hidden rounded-full border border-white/[0.12] shadow-[0_0_28px_rgba(12,122,108,0.4)] transition-shadow duration-300 group-hover:shadow-[0_0_40px_rgba(12,122,108,0.55)]">
              <Image
                src="/wkeyone-logo.png"
                alt={brand}
                fill
                className="object-cover"
                priority
              />
            </div>
            <span className="text-[15px] font-semibold text-white/90 tracking-tight">{brand}</span>
          </Link>

          {/* Central message */}
          <div className="flex-1 flex flex-col justify-center mt-14">
            <span className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3.5 py-1.5 text-xs font-medium text-brand-300">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
              مساعد مبيعات واتساب الذكي
            </span>

            <h2 className="text-3xl xl:text-[2.4rem] font-bold text-white leading-[1.18] tracking-[-0.03em] mb-5">
              أعمالك تستحق<br />
              محادثات أذكى.
            </h2>

            <p className="text-slate-400 text-[15px] leading-relaxed max-w-[340px]">
              منصة ذكية تحوّل محادثات واتساب إلى طلبات مكتملة، وعملاء راضين، وإيرادات تنمو.
            </p>

            {/* Feature list */}
            <div className="mt-8 space-y-3">
              {[
                "ردود ذكية تفهم اللهجة والسياق",
                "إدارة طلبات وعملاء في مكان واحد",
                "تحليلات تكشف فرص النمو الحقيقية",
              ].map((f) => (
                <div key={f} className="flex items-center gap-2.5">
                  <div className="h-4 w-4 rounded-full border border-brand-500/40 bg-brand-500/15 flex items-center justify-center shrink-0">
                    <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                      <path d="M1 3L3 5L7 1" stroke="rgba(47,147,132,1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-[13px] text-slate-400">{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom metrics */}
          <div className="mt-auto">
            <div className="mb-6 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { v: "+47%", l: "معدل التحويل" },
                { v: "3.2×", l: "نمو الإيرادات" },
                { v: "98%", l: "رضا العملاء" },
              ].map((m) => (
                <div key={m.l} className="rounded-xl border border-white/[0.06] bg-white/[0.02] py-3">
                  <div className="text-xl font-bold text-brand-300 tracking-tight">{m.v}</div>
                  <div className="mt-0.5 text-[10px] text-slate-500">{m.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right form panel ────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col relative">
        {/* Subtle ambient for mobile */}
        <div className="pointer-events-none absolute inset-0 lg:hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(12,122,108,0.09),transparent_55%)]" />
        </div>

        {/* Mobile-only logo bar */}
        <div className="relative z-10 flex items-center gap-3 p-5 lg:hidden border-b border-white/[0.05]">
          <div className="h-9 w-9 overflow-hidden rounded-full border border-white/[0.12] shadow-[0_0_20px_rgba(12,122,108,0.3)]">
            <Image src="/wkeyone-logo.png" alt={brand} width={36} height={36} className="object-cover" />
          </div>
          <span className="text-sm font-semibold text-white">{brand}</span>
        </div>

        {/* Centered form */}
        <div className="relative z-10 flex flex-1 items-center justify-center px-5 py-4 sm:py-8 sm:px-8">
          <div className="w-full max-w-[420px]">
            {children}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 pb-6 text-center">
          <p className="text-[11px] text-slate-600">
            بالاستمرار أنت توافق على{" "}
            <Link href="/terms" className="text-slate-500 hover:text-slate-400 transition-colors">شروط الخدمة</Link>
            {" "}و{" "}
            <Link href="/privacy" className="text-slate-500 hover:text-slate-400 transition-colors">سياسة الخصوصية</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
