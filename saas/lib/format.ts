// Centralized formatting utilities. Used across dashboard pages and lib files.
// This is the canonical source for money / date / time formatting.
// Backward-compatible re-exports from lib/utils.ts.

export function fmtNumber(n: number): string {
  return (n || 0).toLocaleString("ar-EG");
}
export function fmtMoney(n: number): string {
  return `${(n || 0).toLocaleString("ar-EG")} ج.م`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  try {
    const x = typeof d === "string" ? new Date(d) : d;
    return x.toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

export function fmtDateTime(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
}

export function timeAgo(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  const sec = Math.floor((Date.now() - x.getTime()) / 1000);
  if (sec < 60) return "الآن";
  if (sec < 3600) return `منذ ${Math.floor(sec / 60)} د`;
  if (sec < 86400) return `منذ ${Math.floor(sec / 3600)} س`;
  if (sec < 86400 * 30) return `منذ ${Math.floor(sec / 86400)} يوم`;
  return fmtDate(d);
}
