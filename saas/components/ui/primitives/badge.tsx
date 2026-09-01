import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
  {
    variants: {
      variant: {
        brand: "border border-brand-500/30 bg-brand-500/10 text-brand-300",
        gold: "border border-gold-500/30 bg-gold-500/10 text-gold-300",
        success: "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        danger: "border border-rose-500/25 bg-rose-500/10 text-rose-300",
        warning: "border border-amber-500/25 bg-amber-500/10 text-amber-300",
        neutral: "border border-white/[0.10] bg-white/[0.04] text-slate-300",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
