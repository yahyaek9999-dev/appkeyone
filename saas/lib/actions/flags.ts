/**
 * lib/actions/flags.ts — Action Engine tunables.
 * Logging/proposing is always allowed; REAL mutations require ACTION_ENGINE_EXECUTE=1.
 */
function flag(key: string, def = false): boolean {
  const v = process.env[key];
  if (v === undefined) return def;
  return v === "1";
}
export const actionFlags = {
  get enabled(): boolean { return flag("ACTION_ENGINE_ENABLED", true); },
  /** When OFF (default), actions are PROPOSED (logged) but never mutate. */
  get execute(): boolean { return flag("ACTION_ENGINE_EXECUTE", false); },
} as const;
