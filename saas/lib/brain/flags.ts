/**
 * lib/brain/flags.ts — KEYONE Brain tunables. Additive + inert by default:
 * the Brain layer never changes existing behavior until an operator opts in.
 */
function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
function flag(key: string, def = false): boolean {
  const v = process.env[key];
  if (v === undefined) return def;
  return v === "1";
}

export const brainFlags = {
  /** Master switch for the Brain layer. */
  get enabled(): boolean {
    return flag("BRAIN_ENABLED", true);
  },
  /** When ON, Brain API calls consume Brain credits and 402 at zero balance. Default OFF (fail-open). */
  get creditsEnabled(): boolean {
    return flag("BRAIN_CREDITS_ENABLED", false);
  },
  /** When ON, the monthly per-plan Brain-credit grant cron actually grants. Default OFF. */
  get monthlyEnabled(): boolean {
    return flag("BRAIN_MONTHLY_CREDITS_ENABLED", false);
  },
  /** Credits consumed per Brain API call. */
  get costPerCall(): number {
    return Math.max(0, num("BRAIN_CREDIT_PER_CALL", 1));
  },
  /** Welcome credits granted on first Brain wallet creation. */
  get welcomeCredits(): number {
    return Math.max(0, num("BRAIN_WELCOME_CREDITS", 0));
  },
} as const;
