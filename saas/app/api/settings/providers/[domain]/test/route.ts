// Universal Providers — connection test / health probe.
//
// POST /api/settings/providers/:domain/test  { provider, values? }
//   - With values: validates freshly-typed credentials WITHOUT saving (ad-hoc).
//   - Without values: re-checks the stored credential.
// Returns { ok, status?, error?, reason? }. reason="no_service" → domain not wired yet.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, getAuthContext } from "@/lib/auth";
import { auditCtx } from "@/lib/audit/log";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { SLUG_TO_DOMAIN } from "@/lib/integrations/registry";
import { checkStoredHealth, checkAdHocHealth } from "@/lib/integrations/health";
import type { ProviderDomain } from "@/lib/integrations/types";

export const dynamic = "force-dynamic";

const Body = z.object({
  provider: z.string().min(1).max(40),
  values: z.record(z.union([z.string(), z.number(), z.null()])).optional(),
});

export async function POST(req: Request, props: { params: Promise<{ domain: string }> }) {
  const params = await props.params;
  const domain = (SLUG_TO_DOMAIN[params.domain] || null) as ProviderDomain | null;
  if (!domain) return NextResponse.json({ error: "unknown_domain" }, { status: 404 });

  let user;
  try {
    user = await requirePermission("settings");
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limited = enforceRateLimit(req as any, { name: "providers-test", identifier: user.id, ...RATE_LIMITS.api });
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const result = parsed.data.values
    ? await checkAdHocHealth(user.id, domain, parsed.data.provider, parsed.data.values)
    : await checkStoredHealth(user.id, domain, parsed.data.provider);

  void auditCtx(await getAuthContext(), "settings.provider_tested", {
    userId: user.id,
    targetType: "provider_credential",
    targetId: `${domain}:${parsed.data.provider}`,
    metadata: { domain, provider: parsed.data.provider, ok: result.ok, status: result.status },
    req,
  });

  return NextResponse.json(result);
}
