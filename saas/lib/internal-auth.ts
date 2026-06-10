// Shared guard for x-internal-secret protected routes (cron jobs + internal ops
// endpoints). Centralizes the auth check so every route is fail-CLOSED and uses
// a constant-time comparison.
//
// SECURITY: the previous per-route pattern was
//   const SECRET = process.env.SAAS_INTERNAL_SECRET || "dev-internal-secret-change-me";
//   if (req.headers.get("x-internal-secret") !== SECRET) { ...401 }
// which (a) fell back to a PUBLICLY-KNOWN default string when the env var was
// unset — letting anyone who read the repo trigger crons — and (b) used a
// non-constant-time `!==`. This helper removes the default (no secret ⇒ always
// reject) and uses crypto.timingSafeEqual. `validateEnv()` already makes
// SAAS_INTERNAL_SECRET required in production, so correctly-configured prod
// instances are unaffected; this only closes the misconfigured / non-prod hole.

import { timingSafeEqual } from "crypto";

/** True iff the request carries the correct x-internal-secret header. */
export function checkInternalSecret(req: Request): boolean {
  const expected = process.env.SAAS_INTERNAL_SECRET;
  if (!expected) return false; // fail closed — never accept when unset
  const provided = req.headers.get("x-internal-secret");
  if (!provided) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  // timingSafeEqual throws on unequal lengths; a length mismatch is a constant
  // -time false from the caller's perspective (it cannot observe which branch).
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
