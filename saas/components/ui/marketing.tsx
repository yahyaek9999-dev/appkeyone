import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<{ className?: string }>;

export function BrandMark({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-300 via-brand-500 to-brand-700 ring-1 ring-white/15",
        className,
      )}
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.38),transparent_28%)]" />
      <svg
        viewBox="0 0 24 24"
        className={cn("relative h-5 w-5 text-white", iconClassName)}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    </span>
  );
}

export function WhatsAppIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      <path d="M9.2 8.7c.2-.4.4-.5.7-.5h.5c.2 0 .4.1.5.4l.7 1.7c.1.3.1.5-.1.7l-.4.5c.5.9 1.2 1.6 2.1 2.1l.5-.4c.2-.2.5-.2.7-.1l1.7.7c.3.1.4.3.4.6v.5c0 .3-.1.5-.4.7-.4.3-.9.4-1.5.3-3.1-.5-5.6-3-6.1-6.1-.1-.5 0-1 .2-1.4Z" />
    </svg>
  );
}

export function AiBackground({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_20%,rgba(34,197,94,0.10),transparent_50%),radial-gradient(circle_at_20%_80%,rgba(34,197,94,0.05),transparent_50%),linear-gradient(180deg,#020806_0%,#06110d_48%,#020806_100%)]" />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage:
            "radial-gradient(ellipse 70% 50% at 50% 50%, black 18%, transparent 76%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 50% at 50% 50%, black 18%, transparent 76%)",
        }}
      />
    </div>
  );
}

// Calm, premium ambient backdrop for public pages — a single low-opacity
// brand wash + a masked fine grid. No strong glow, no blobs. Purely decorative.
export function AmbientBackdrop({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_55%_at_50%_-10%,rgba(34,197,94,0.06),transparent_60%)]" />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black 10%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black 10%, transparent 72%)",
        }}
      />
    </div>
  );
}

// Minimal QR-style glyph (decorative) for the WhatsApp connect visual.
export function QrGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="currentColor" aria-hidden="true">
      <path d="M6 6h14v14H6V6zm3 3v8h8V9H9z" />
      <path d="M12 12h2v2h-2zM28 6h14v14H28V6zm3 3v8h8V9h-8z" />
      <path d="M34 12h2v2h-2zM6 28h14v14H6V28zm3 3v8h8v-8H9z" />
      <path d="M12 34h2v2h-2zM28 28h5v5h-5zM35 28h7v3h-4v4h-3zM28 35h3v7h-3zM34 36h4v3h-4zM39 33h3v9h-3zM34 39h3v3h-3z" />
    </svg>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto mb-14 max-w-2xl text-center", className)}>
      {eyebrow && (
        <span className="mb-4 inline-block text-xs font-semibold uppercase tracking-[0.12em] text-brand-400/70">
          {eyebrow}
        </span>
      )}
      <h2 className="text-3xl font-bold leading-tight tracking-[-0.03em] text-white sm:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
          {description}
        </p>
      )}
    </div>
  );
}
