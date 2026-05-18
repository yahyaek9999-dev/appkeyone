/**
 * KEYONE Tier-1 — TypingIndicator
 * Source: reference-extracts/tier1/inbox/TypingIndicator.tsx
 * Three-dot animated indicator inside a chat bubble.
 * Use for: "AI is replying", "Agent is typing", "Auto-follow-up composing".
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export interface TypingIndicatorProps {
  /** Optional label above the bubble, e.g. "الذكاء الاصطناعي" */
  label?: string;
  className?: string;
}

export function TypingIndicator({ label, className }: TypingIndicatorProps) {
  return (
    <div className={cn("flex w-full justify-start", className)} aria-live="polite">
      <div className="max-w-[75%] flex flex-col gap-0.5">
        {label && (
          <div className="px-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
            {label}
          </div>
        )}
        <div className="rounded-2xl rounded-es-sm bg-white/5 px-3.5 py-2.5 shadow-sm">
          <div className="flex items-center gap-1" aria-label="يكتب الآن">
            <Dot delay="0ms" />
            <Dot delay="150ms" />
            <Dot delay="300ms" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="block size-1.5 rounded-full bg-slate-400/60 animate-bounce"
      style={{ animationDelay: delay, animationDuration: "1.1s" }}
    />
  );
}
