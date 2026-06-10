// Universal Providers — set failover priority order.
//
// POST /api/settings/providers/:domain/reorder  { order: ["openai","claude",...] }
// Lower index = tried first. Drives runWithFailover() ordering.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, getAuthContext } from "@/lib/auth";
import { auditCtx } from "@/lib/audit/log";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { SLUG_TO_DOMAIN } from "@/lib/integrations/registry";
import { reorderCredentials } from "@/lib/integrations/vault";
import type { ProviderDomain } from "@/lib/integrations/types";

export const dynamic = "force-dynamic";

const Body = z.object({ order: z.array(z.string().min(1).max(40)).max(20) });

export async function POST(req: Request, { params }: { params: { domain: string } }) {
  const domain = (SLUG_TO_DOMAIN[params.domain] || null) as ProviderDomain | null;
  if (!domain) return NextResponse.json({ error: "unknown_domain" }, { status: 404 });

  let user;
  try {
    user = await requirePermission("settings");
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limited = enforceRateLimit(req as any, { name: "providers-reorder", identifier: user.id, ...RATE_LIMITS.api });
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  await reorderCredentials(user.id, domain, parsed.data.order);
  void auditCtx(await getAuthContext(), "settings.provider_reordered", {
    userId: user.id,
    targetType: "provider_domain",
    targetId: domain,
    metadata: { domain, order: parsed.data.order },
    req,
  });
  return NextResponse.json({ ok: true });
}
