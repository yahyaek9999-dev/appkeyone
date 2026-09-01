import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

interface FormFieldProps {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

function FormField({ label, htmlFor, hint, error, required, children, className }: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor}>
          {label}
          {required && <span className="mr-0.5 text-rose-400" aria-hidden="true">*</span>}
        </Label>
      )}
      {children}
      {hint && !error && (
        <p className="text-xs text-slate-500">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-rose-400" role="alert">{error}</p>
      )}
    </div>
  );
}

export { FormField };
