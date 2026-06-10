import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { rotateCommerceIntegrationSecrets, publicIntegration } from "@/lib/commerce/integrations";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  let user;
  try { user = await requirePermission("settings"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const limited = enforceRateLimit(req, { name: "commerce-integration-rotate", identifier: user.id, ...RATE_LIMITS.api });
  if (limited) return limited;

  const result = await rotateCommerceIntegrationSecrets({ userId: user.id, integrationId: params.id });
  if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    integration: publicIntegration(result.integration, new URL(req.url).origin),
    credentials: result.credentials,
  });
}
