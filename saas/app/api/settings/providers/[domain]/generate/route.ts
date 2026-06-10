// Universal Providers — image generation (marketing / product images).
//
// POST /api/settings/providers/images/generate  { prompt, size? }
// Generates an image via the tenant's generate-capable image providers
// (OpenAI Images / Replicate / Stability / custom) with failover. Only the
// image domain supports this; other domains return 400.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { SLUG_TO_DOMAIN } from "@/lib/integrations/registry";
import { generateImageWithFailover } from "@/lib/integrations/image";
import type { ProviderDomain } from "@/lib/integrations/types";

export const dynamic = "force-dynamic";

const Body = z.object({ prompt: z.string().min(1).max(2000), size: z.string().max(20).optional() });

export async function POST(req: Request, { params }: { params: { domain: string } }) {
  const domain = (SLUG_TO_DOMAIN[params.domain] || null) as ProviderDomain | null;
  if (domain !== "image") return NextResponse.json({ error: "generation_not_supported_for_domain" }, { status: 400 });

  let user;
  try {
    user = await requirePermission("settings");
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limited = enforceRateLimit(req as any, { name: "providers-image-generate", identifier: user.id, ...RATE_LIMITS.api });
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const r = await generateImageWithFailover(user.id, { prompt: parsed.data.prompt, size: parsed.data.size });
  if (r.ok) return NextResponse.json({ ok: true, provider: r.provider, url: r.result.url, b64: r.result.b64 });
  return NextResponse.json(
    { ok: false, reason: r.reason, detail: r.detail || "" },
    { status: r.reason === "no_provider_configured" ? 400 : 502 },
  );
}
