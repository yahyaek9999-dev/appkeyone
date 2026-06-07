/**
 * KEYONE Tier-1 — Avatar
 * Source: reference-extracts/tier1/shared/Avatar.tsx
 * Adapted: deterministic color, RTL-safe, dark-theme only.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

const PALETTE = [
  "bg-rose-500/15 text-rose-300",
  "bg-amber-500/15 text-amber-300",
  "bg-emerald-500/15 text-emerald-300",
  "bg-sky-500/15 text-sky-300",
  "bg-gold-500/15 text-gold-300",
  "bg-pink-500/15 text-pink-300",
  "bg-teal-500/15 text-teal-300",
  "bg-teal-500/15 text-teal-300",
];

const SIZES = {
  xs: "size-5 text-[9px]",
  sm: "size-7 text-[10px]",
  md: "size-9 text-[12px]",
  lg: "size-12 text-sm",
  xl: "size-16 text-base",
} as const;

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  src?: string;
  size?: keyof typeof SIZES;
  rounded?: boolean;
}

export function Avatar({
  name,
  src,
  size = "md",
  rounded = true,
  className,
  ...props
}: AvatarProps) {
  const color = PALETTE[hash(name) % PALETTE.length];
  return (
    <div
      role="img"
      aria-label={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-medium select-none overflow-hidden",
        rounded ? "rounded-full" : "rounded-md",
        SIZES[size],
        !src && color,
        className
      )}
      {...props}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="size-full object-cover" />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  );
}
