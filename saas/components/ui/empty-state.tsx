import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

const SIZE_CONFIG = {
  sm: { wrap: "py-9 gap-3", shell: "h-11 w-11 rounded-xl", icon: "size-5", title: "text-sm", desc: "text-xs", max: "max-w-xs" },
  md: { wrap: "py-14 gap-4", shell: "h-14 w-14 rounded-2xl", icon: "size-6", title: "text-base", desc: "text-sm", max: "max-w-sm" },
  lg: { wrap: "py-20 gap-5", shell: "h-16 w-16 rounded-2xl", icon: "size-7", title: "text-lg", desc: "text-sm", max: "max-w-md" },
};

export function EmptyState({
  icon, title, description, action, size = "md", className, ...props
}: EmptyStateProps) {
  const s = SIZE_CONFIG[size];
  return (
    <div className={cn("flex w-full flex-col items-center justify-center px-6 text-center", s.wrap, className)} {...props}>
      {icon && (
        <div className="relative">
          {/* soft ambient halo behind the icon shell */}
          <div className="pointer-events-none absolute inset-0 -z-10 scale-150 rounded-full bg-brand-500/[0.06] blur-2xl" />
          <div
            className={cn(
              "flex items-center justify-center text-slate-400 ring-1 ring-inset ring-white/[0.08]",
              "bg-gradient-to-b from-white/[0.06] to-white/[0.01] shadow-card",
              s.shell,
            )}
          >
            <span className={cn("text-slate-300/80", s.icon)}>{icon}</span>
          </div>
        </div>
      )}
      <div className={cn("space-y-1.5", s.max)}>
        <h3 className={cn("font-semibold tracking-[-0.01em] text-white", s.title)}>{title}</h3>
        {description && <p className={cn("leading-relaxed text-slate-500", s.desc)}>{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
