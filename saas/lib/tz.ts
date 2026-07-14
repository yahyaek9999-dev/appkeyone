// Centralized timezone helpers. All "what is the local hour / day for this
// merchant" questions go through here so the rest of the codebase stays
// timezone-agnostic. Pure functions, no DB.
//
// Why a small util instead of a heavy library: Node's built-in
// Intl.DateTimeFormat already handles every IANA timezone. We just need
// thin wrappers to extract numeric parts.

export interface TzParts {
  year: number;
  month: number;   // 1-12
  day: number;     // 1-31
  weekday: number; // 0=Sun … 6=Sat (matches Date.getDay)
  hour: number;    // 0-23
  minute: number;  // 0-59
}

const SAFE_DEFAULT = "Africa/Cairo";

/** Validate an IANA timezone; fall back to Africa/Cairo if invalid. */
export function safeTz(tz: string | null | undefined): string {
  const t = (tz || "").trim();
  if (!t) return SAFE_DEFAULT;
  try {
    // Throws RangeError for unknown tz.
    new Intl.DateTimeFormat("en-US", { timeZone: t }).format(new Date());
    return t;
  } catch {
    return SAFE_DEFAULT;
  }
}

/** Get the year/month/day/weekday/hour/minute for a Date in a target tz. */
export function partsInTz(d: Date, tz: string): TzParts {
  const zone = safeTz(tz);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const out: any = {};
  for (const p of fmt.formatToParts(d)) {
    out[p.type] = p.value;
  }
  // weekday short → 0..6
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    year:    parseInt(out.year, 10),
    month:   parseInt(out.month, 10),
    day:     parseInt(out.day, 10),
    weekday: map[out.weekday] ?? 0,
    // Some Intl versions emit "24" at midnight — normalize.
    hour:    parseInt(out.hour, 10) % 24,
    minute:  parseInt(out.minute, 10),
  };
}

/** Local hour 0-23 in `tz` for the given Date (defaults to now). */
export function localHour(tz: string, d: Date = new Date()): number {
  return partsInTz(d, tz).hour;
}

/** Local weekday 0-6 (Sun=0) in `tz`. */
export function localWeekday(tz: string, d: Date = new Date()): number {
  return partsInTz(d, tz).weekday;
}

/** YYYY-MM-DD key in `tz` — used to dedupe "once per local day" jobs. */
export function localYmd(tz: string, d: Date = new Date()): string {
  const p = partsInTz(d, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * The real UTC instant for local midnight of `d`'s calendar day in `tz`.
 * Use this (not `new Date(); setHours(0,0,0,0)`) for any "today"/day-boundary
 * DB query — `setHours` runs in the server's own local time (UTC on the
 * production box), which is 2-3 hours off Africa/Cairo and produces the
 * wrong bucket for roughly the first few hours of every Cairo day.
 * Handles DST/offset correctly via a standard double-conversion.
 */
export function startOfLocalDay(tz: string, d: Date = new Date()): Date {
  const zone = safeTz(tz);
  const p = partsInTz(d, zone);
  const naiveUtcMidnight = Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0);
  const atNaive = partsInTz(new Date(naiveUtcMidnight), zone);
  const localMsAtNaive = Date.UTC(atNaive.year, atNaive.month - 1, atNaive.day, atNaive.hour, atNaive.minute, 0);
  const offsetMs = naiveUtcMidnight - localMsAtNaive;
  return new Date(naiveUtcMidnight + offsetMs);
}
