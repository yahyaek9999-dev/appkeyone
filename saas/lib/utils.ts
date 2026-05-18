import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function fmtDate(d: Date | string) {
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleString("ar-EG", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
export function timeAgo(d: Date | string) {
  const x = typeof d === "string" ? new Date(d) : d;
  const sec = Math.floor((Date.now() - x.getTime()) / 1000);
  if (sec < 60) return "الآن";
  if (sec < 3600) return `منذ ${Math.floor(sec / 60)} د`;
  if (sec < 86400) return `منذ ${Math.floor(sec / 3600)} س`;
  return `منذ ${Math.floor(sec / 86400)} يوم`;
}
