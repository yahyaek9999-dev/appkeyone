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
        "relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-300 via-brand-500 to-brand-700 shadow-[0_0_30px_rgba(34,197,94,0.34)] ring-1 ring-white/15",
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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_18%,rgba(34,197,94,0.22),transparent_30%),radial-gradient(circle_at_15%_76%,rgba(34,197,94,0.11),transparent_36%),linear-gradient(180deg,#020806_0%,#06110d_48%,#020806_100%)]" />
      <div
        className="absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,197,94,0.45) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.45) 1px, transparent 1px)",
          backgroundSize: "92px 92px",
          maskImage:
            "radial-gradient(ellipse 78% 58% at 74% 38%, black 18%, transparent 76%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 78% 58% at 74% 38%, black 18%, transparent 76%)",
        }}
      />
      <div className="absolute left-[8%] top-[12%] h-44 w-44 rounded-full bg-brand-500/10 blur-3xl" />
      <div className="absolute right-[8%] bottom-[12%] h-56 w-56 rounded-full bg-emerald-400/10 blur-[90px]" />
    </div>
  );
}

export function AiBadge({
  children,
  icon: Icon,
  className,
}: {
  children: ReactNode;
  icon?: IconComponent;
  className?: string;
}) {
  return (
    <div className={cn("ai-badge", className)}>
      {Icon ? <Icon className="h-3.5 w-3.5" /> : <span className="h-2.5 w-2.5 rounded-full bg-brand-400 shadow-[0_0_16px_rgba(34,197,94,0.9)]" />}
      <span>{children}</span>
    </div>
  );
}

export function AiCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("ai-card", className)}>{children}</div>;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  icon,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  icon?: IconComponent;
}) {
  return (
    <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-14">
      {eyebrow && <AiBadge icon={icon} className="mb-4">{eyebrow}</AiBadge>}
      <h2 className="ai-heading text-3xl sm:text-4xl">{title}</h2>
      {description && <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">{description}</p>}
    </div>
  );
}
