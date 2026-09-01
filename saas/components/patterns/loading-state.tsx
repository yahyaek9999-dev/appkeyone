import * as React from "react";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  message?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

function LoadingState({ message, className, size = "md" }: LoadingStateProps) {
  const spinnerSize = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-8 w-8" }[size];
  const textSize = { sm: "text-xs", md: "text-sm", lg: "text-base" }[size];

  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3 py-12 text-center", className)}
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          "animate-spin rounded-full border-2 border-white/10 border-t-brand-400",
          spinnerSize,
        )}
      />
      {message && (
        <p className={cn("text-slate-400", textSize)}>{message}</p>
      )}
      <span className="sr-only">جاري التحميل...</span>
    </div>
  );
}

export { LoadingState };
