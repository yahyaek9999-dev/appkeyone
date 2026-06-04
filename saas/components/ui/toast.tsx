"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_CONFIG: Record<ToastTone, { icon: React.ReactNode; border: string; text: string }> = {
  success: {
    icon: <CheckCircle2 className="h-5 w-5 text-emerald-400" />,
    border: "border-emerald-500/25",
    text: "text-emerald-100",
  },
  error: {
    icon: <AlertCircle className="h-5 w-5 text-rose-400" />,
    border: "border-rose-500/25",
    text: "text-rose-100",
  },
  info: {
    icon: <Info className="h-5 w-5 text-brand-300" />,
    border: "border-brand-500/25",
    text: "text-slate-100",
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, tone: ToastTone = "info") => {
    if (!message) return;
    const id = ++counter.current;
    setItems((prev) => [...prev, { id, tone, message }]);
  }, []);

  const value: ToastContextValue = {
    toast,
    success: useCallback((m: string) => toast(m, "success"), [toast]),
    error: useCallback((m: string) => toast(m, "error"), [toast]),
    info: useCallback((m: string) => toast(m, "info"), [toast]),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDone={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const cfg = TONE_CONFIG[item.tone];

  useEffect(() => {
    const t = setTimeout(() => setLeaving(true), 4000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onDone, 220);
    return () => clearTimeout(t);
  }, [leaving, onDone]);

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border bg-canvas-raised/95 px-4 py-3 text-sm shadow-elevated backdrop-blur-xl transition-all duration-200",
        cfg.border,
        leaving ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100",
      )}
    >
      <div className="mt-0.5 shrink-0">{cfg.icon}</div>
      <div className={cn("min-w-0 flex-1 leading-relaxed", cfg.text)}>{item.message}</div>
      <button
        onClick={() => setLeaving(true)}
        className="mt-0.5 shrink-0 text-slate-500 transition hover:text-white"
        aria-label="إغلاق"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Graceful fallback if a component using useToast renders outside the provider.
    return {
      toast: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
    };
  }
  return ctx;
}
