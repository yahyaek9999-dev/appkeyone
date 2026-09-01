import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}

function ErrorState({
  title = "حدث خطأ",
  message,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-4 py-12 text-center", className)}
      role="alert"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-rose-500/25 bg-rose-500/10">
        <AlertTriangle className="h-6 w-6 text-rose-400" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-white">{title}</p>
        {message && <p className="text-xs text-slate-400">{message}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export { ErrorState };
