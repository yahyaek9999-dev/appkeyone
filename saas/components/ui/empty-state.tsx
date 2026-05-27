import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

const SIZE_CONFIG = {
  sm: { wrap: "py-8 gap-2", icon: "size-8", title: "text-sm", desc: "text-xs" },
  md: { wrap: "py-12 gap-3", icon: "size-10", title: "text-base", desc: "text-sm" },
  lg: { wrap: "py-20 gap-4", icon: "size-14", title: "text-lg", desc: "text-sm" },
};

export function EmptyState({
  icon, title, description, action, size = "md", className, ...props
}: EmptyStateProps) {
  const s = SIZE_CONFIG[size];
  return (
    <div className={cn("flex w-full flex-col items-center justify-center text-center px-6", s.wrap, className)} {...props}>
      {icon && (
        <div className={cn("flex items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 text-slate-400", s.icon)}>
          {icon}
        </div>
      )}
      <div className="max-w-sm space-y-1">
        <h3 className={cn("font-semibold text-slate-200", s.title)}>{title}</h3>
        {description && <p className={cn("text-slate-500", s.desc)}>{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
