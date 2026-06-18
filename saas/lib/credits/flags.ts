/**
 * lib/credits/flags.ts — broadcast-credit tunables.
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

export const creditFlags = {
  /** Credits consumed per recipient in a QR broadcast campaign. */
  get perRecipient(): number {
    return num("BROADCAST_CREDIT_PER_RECIPIENT", 1);
  },
  /** Welcome credits granted to a wallet on first creation (default 0). */
  get welcomeCredits(): number {
    return num("BROADCAST_WELCOME_CREDITS", 0);
  },
  /** When ON, campaign creation is blocked if credits are insufficient. */
  get enforce(): boolean {
    return flag("BROADCAST_CREDITS_ENFORCE", true);
  },
} as const;
