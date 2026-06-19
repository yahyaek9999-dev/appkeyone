"use client";

import { useRef, useCallback, useLayoutEffect } from "react";
import { gsap } from "gsap";
import HeroVideo from "./hero-video";
import ParticleField from "./particle-field";
import { WhatsAppIcon } from "@/components/ui/marketing";
import { FrameButton } from "@/components/ui/frame-button";
import { cn } from "@/lib/utils";

// ── Props ────────────────────────────────────────────────────────────────────
type HeroSectionProps = {
  brandName: string;
  supportWhatsapp?: string | null;
  locale: string;
  videoSrc: string;
  mobileVideoSrc?: string;
  ctaPrimary: string;
  ctaSecondary: string;
};

// ── Light Sweep ───────────────────────────────────────────────────────────────
/** A subtle animated gradient that sweeps horizontally across the hero. */
function LightSweep() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[2] overflow-hidden opacity-20"
      aria-hidden="true"
    >
      <div
        className="absolute inset-y-0 w-[40%] animate-light-sweep"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(12,122,108,0.14), rgba(255,255,255,0.06), rgba(201,162,75,0.10), transparent)",
          transform: "translateX(-100%) skewX(-18deg)",
        }}
      />
    </div>
  );
}

// ── Cinematic Grid ───────────────────────────────────────────────────────────
function CinematicGrid() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden="true">
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          maskImage: "radial-gradient(ellipse 70% 50% at 50% 50%, black 15%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 50% at 50% 50%, black 15%, transparent 70%)",
        }}
      />
    </div>
  );
}

// ── Ambient Glows ─────────────────────────────────────────────────────────────
function AmbientGlows() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden="true">
      {/* Primary glow — large emerald wash */}
      <div
        className="absolute left-1/2 top-1/4 h-[60vh] w-[50vw] -translate-x-1/2 rounded-full"
        style={{
          background: "radial-gradient(ellipse, rgba(12,122,108,0.07), transparent 60%)",
        }}
      />
      {/* Secondary glow — champagne gold accent offset */}
      <div
        className="absolute -right-[10%] top-[10%] h-[50vh] w-[35vw] rounded-full"
        style={{
          background: "radial-gradient(ellipse, rgba(201,162,75,0.05), transparent 60%)",
        }}
      />
    </div>
  );
}

// ── Mouse Parallax Context ───────────────────────────────────────────────────
function useMouseParallax() {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const tickingRef = useRef(false);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!tickingRef.current) {
      window.requestAnimationFrame(() => {
        const el = contentRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (e.clientX - cx) / rect.width;
        const dy = (e.clientY - cy) / rect.height;
        el.style.transform = `translate(${dx * -12}px, ${dy * -12}px)`;
        tickingRef.current = false;
      });
      tickingRef.current = true;
    }
  }, []);

  return { containerRef, contentRef, handleMouseMove };
}

// ── Entrance animation (GSAP) ────────────────────────────────────────────────
function useRevealAnimation() {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const items = el.querySelectorAll<HTMLElement>(
      "[data-reveal]",
    );

    gsap.fromTo(
      items,
      { y: 32, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 1,
        stagger: 0.12,
        ease: "power3.out",
      },
    );
  }, []);

  return ref;
}

// ── Hero Section ──────────────────────────────────────────────────────────────
export default function HeroSection({
  brandName,
  supportWhatsapp,
  locale,
  videoSrc,
  mobileVideoSrc,
  ctaPrimary,
  ctaSecondary,
}: HeroSectionProps) {
  const isRtl = locale === "ar";
  const Arrow = ({ className }: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-4 w-4", className)}
    >
      {isRtl ? (
        <>
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </>
      ) : (
        <>
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </>
      )}
    </svg>
  );

  const { contentRef, handleMouseMove } = useMouseParallax();
  const revealRef = useRevealAnimation();

  const waNum = (supportWhatsapp || "").replace(/[^\d]/g, "");
  const waHref = waNum
    ? `https://wa.me/${waNum}?text=${encodeURIComponent(
        isRtl
          ? `أريد طلب حساب جديد في ${brandName}`
          : `I'd like to subscribe to ${brandName}`,
      )}`
    : "";

  const headline = isRtl
    ? "أتمتة واتساب وذكاء الأعمال لمتجرك"
    : "WhatsApp automation & business intelligence for your store";
  const subhead = isRtl
    ? "ردّ تلقائي على عملائك خلال ثوانٍ، يرصد كل طلب، ويرسل تقاريرك — مباشرةً داخل واتساب."
    : "Reply to customers in seconds, capture every order, and get instant reports — right inside WhatsApp.";

  return (
    <section
      className="relative flex h-[100svh] min-h-[600px] flex-col overflow-hidden bg-black"
      onMouseMove={handleMouseMove}
    >
      {/* ── Background Layers (cinematic logo video) ── */}
      <HeroVideo src={videoSrc} mobileSrc={mobileVideoSrc} />
      <AmbientGlows />
      <CinematicGrid />
      <LightSweep />
      <ParticleField />

      {/* ── Value-proposition overlay — VISIBLE within the first screen so a
            first-time owner understands what KEYONE does + a CTA in <10s ── */}
      <div ref={revealRef} className="relative z-20 mt-auto w-full px-6 pb-14 pt-28 text-center sm:pb-20">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/85 to-transparent" aria-hidden="true" />
        <div ref={contentRef} className="relative mx-auto max-w-2xl">
          <h1 data-reveal className="text-balance text-3xl font-bold leading-tight tracking-[-0.02em] text-white sm:text-5xl">
            {headline}
          </h1>
          <p data-reveal className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
            {subhead}
          </p>
          <div data-reveal className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {waNum ? (
              <FrameButton href={waHref} variant="solid" external>
                <WhatsAppIcon className="h-4 w-4" />
                {ctaPrimary}
              </FrameButton>
            ) : (
              <FrameButton href="/pricing" variant="solid">
                {ctaPrimary}
                <Arrow />
              </FrameButton>
            )}
            <FrameButton href="/pricing" variant="outline">
              {ctaSecondary}
              {!waNum && <Arrow />}
            </FrameButton>
          </div>
        </div>
      </div>
    </section>
  );
}
