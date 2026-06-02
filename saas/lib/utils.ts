import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Backward-compatible re-exports. The canonical implementations live in
// lib/format.ts — new code should import from there directly.
export { fmtMoney, fmtDate, fmtDateTime, timeAgo } from "@/lib/format";
