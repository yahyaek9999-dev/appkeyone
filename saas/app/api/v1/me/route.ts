/**
 * Public API v1 — identity.
 *   GET /api/v1/me — returns the authenticated tenant's id + current plan.
 *
 * Auth is via API key (Authorization: Bearer <key>  OR  x-api-key), NOT a
 * session cookie. The identity is DERIVED from the key by `withApiKey`, so a
 * caller can never read another tenant. Scope required: "read".
 */
import { NextResponse } from "next/server";
import { withApiKey } from "@/lib/developer/api-gate";
import { getEntitlements } from "@/lib/membership/entitlements";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withApiKey(req, "read", async (id) => {
    const ent = await getEntitlements(id.userId).catch(() => null);
    return NextResponse.json({
      userId: id.userId,
      plan: ent ? { slug: ent.slug, name: ent.planName, tier: ent.tier } : null,
      scopes: id.scopes,
      rateLimitPerMin: id.rateLimitPerMin,
    });
  });
}
