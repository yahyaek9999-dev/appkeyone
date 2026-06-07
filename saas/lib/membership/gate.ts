/**
 * Server helpers for capability-gated dashboard pages + API routes.
 * Additive — wraps the entitlements layer so pages/routes stay tiny.
 */

import { NextResponse } from "next/server";
import { getAuthContext, getUserId } from "@/lib/auth";
import { can, type Permission } from "@/lib/rbac";
import {
  getEntitlements,
  hasCapability,
  PaywallError,
} from "@/lib/membership/entitlements";
import { tierUnlocking } from "@/lib/pricing/catalog";

export interface PageGate {
  uid: string;
  allowed: boolean;
  recommendedTier: string | null;
}

/**
 * For server components. Returns the uid + whether the capability is unlocked.
 * Never throws/redirects — the page decides whether to render <LockedFeature>.
 * Returns allowed=false with uid="" when unauthenticated (caller redirects).
 */
export async function pageGate(capKey: string): Promise<PageGate> {
  const uid = await getUserId();
  if (!uid) return { uid: "", allowed: false, recommendedTier: tierUnlocking(capKey) };
  let allowed = true;
  try {
    allowed = await hasCapability(uid, capKey);
  } catch {
    allowed = true; // fail-open
  }
  return { uid, allowed, recommendedTier: tierUnlocking(capKey) };
}

/**
 * For API routes. Returns uid if authed AND entitled; otherwise returns a
 * ready-to-send NextResponse (401 or 402). Usage:
 *   const g = await apiGate("flow_builder");
 *   if (g.response) return g.response;
 *   const uid = g.uid!;
 */
export async function apiGate(
  capKey: string,
  permission?: Permission,
): Promise<{ uid: string | null; response: NextResponse | null }> {
  const ctx = await getAuthContext();
  if (!ctx) {
    return { uid: null, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (permission && !can(ctx.role, permission)) {
    return { uid: null, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  const uid = ctx.user.id;
  try {
    const ok = await hasCapability(uid, capKey);
    if (!ok) {
      const err = new PaywallError(capKey);
      return {
        uid,
        response: NextResponse.json(
          { error: "capability_locked", capability: capKey, recommendedTier: err.recommendedTier },
          { status: 402 },
        ),
      };
    }
  } catch {
    // fail-open on gating bugs — never block on our own error.
  }
  return { uid, response: null };
}
