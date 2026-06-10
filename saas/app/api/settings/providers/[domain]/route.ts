// Universal Providers — generic settings API (one route serves all 5 domains).
//
// GET    /api/settings/providers/:domain        → registry options + masked creds + usage + recent logs
// PUT    /api/settings/providers/:domain         → upsert one provider's credential
// DELETE /api/settings/providers/:domain?provider=x → remove a credential
//
// Security: requirePermission("settings") · rate-limited · secrets encrypted in
// the vault, never returned raw · custom endpoints SSRF-validated in the vault ·
// every mutation audited. :domain is the URL slug (ai|voice|images|sms|email).

import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, getAuthContext } from "@/lib/auth";
import { auditCtx } from "@/lib/audit/log";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { SLUG_TO_DOMAIN, DOMAIN_LABELS, listProviders } from "@/lib/integrations/registry";
import { listCredentials, saveCredential, deleteCredential } from "@/lib/integrations/vault";
import { recentCalls, domainUsage } from "@/lib/integrations/usage";
import "@/lib/integrations/register"; // register wired domain services
import { hasService } from "@/lib/integrations/services";
import type { ProviderDomain } from "@/lib/integrations/types";

export const dynamic = "force-dynamic";

function domainOf(slug: string): ProviderDomain | null {
  return SLUG_TO_DOMAIN[slug] || null;
}

async function authOr401() {
  try {
    return { user: await requirePermission("settings") };
  } catch {
    return { user: null };
  }
}

export async function GET(_req: Request, props: { params: Promise<{ domain: string }> }) {
  const params = await props.params;
  const domain = domainOf(params.domain);
  if (!domain) return NextResponse.json({ error: "unknown_domain" }, { status: 404 });
  const { user } = await authOr401();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [items, usage, logs] = await Promise.all([
    listCredentials(user.id, domain),
    domainUsage(user.id, domain).catch(() => ({})),
    recentCalls(user.id, domain, 40).catch(() => []),
  ]);

  return NextResponse.json({
    ok: true,
    domain,
    label: DOMAIN_LABELS[domain],
    serviceReady: hasService(domain),
    providers: listProviders(domain),
    items,
    usage,
    logs,
  });
}

const PutBody = z.object({
  provider: z.string().min(1).max(40),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(9999).optional(),
  label: z.string().max(120).optional(),
  values: z.record(z.union([z.string(), z.number(), z.null()])).default({}),
});

export async function PUT(req: Request, props: { params: Promise<{ domain: string }> }) {
  const params = await props.params;
  const domain = domainOf(params.domain);
  if (!domain) return NextResponse.json({ error: "unknown_domain" }, { status: 404 });
  const { user } = await authOr401();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = enforceRateLimit(req as any, { name: "providers-save", identifier: user.id, ...RATE_LIMITS.api });
  if (limited) return limited;

  const parsed = PutBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const result = await saveCredential(user.id, domain, parsed.data.provider, {
    enabled: parsed.data.enabled,
    priority: parsed.data.priority,
    label: parsed.data.label,
    values: parsed.data.values,
  });
  if (!result.ok) {
    const status = result.error === "endpoint_blocked" ? 400 : result.error === "missing_required" ? 400 : 400;
    return NextResponse.json({ error: result.error, field: result.field }, { status });
  }

  void auditCtx(await getAuthContext(), "settings.provider_changed", {
    userId: user.id,
    targetType: "provider_credential",
    targetId: `${domain}:${parsed.data.provider}`,
    metadata: { domain, provider: parsed.data.provider, enabled: parsed.data.enabled, priority: parsed.data.priority },
    req,
  });

  return NextResponse.json({ ok: true, credential: result.credential });
}

export async function DELETE(req: Request, props: { params: Promise<{ domain: string }> }) {
  const params = await props.params;
  const domain = domainOf(params.domain);
  if (!domain) return NextResponse.json({ error: "unknown_domain" }, { status: 404 });
  const { user } = await authOr401();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const provider = new URL(req.url).searchParams.get("provider") || "";
  if (!provider) return NextResponse.json({ error: "missing_provider" }, { status: 400 });

  const ok = await deleteCredential(user.id, domain, provider);
  if (ok) {
    void auditCtx(await getAuthContext(), "settings.provider_deleted", {
      userId: user.id,
      targetType: "provider_credential",
      targetId: `${domain}:${provider}`,
      metadata: { domain, provider },
      req,
    });
  }
  return NextResponse.json({ ok });
}
