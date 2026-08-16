import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, getAuthContext } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";
import { auditCtx } from "@/lib/audit/log";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { COMMERCE_PLATFORMS } from "@/lib/commerce/types";
import { createCommerceIntegration, publicIntegration } from "@/lib/commerce/integrations";

export const dynamic = "force-dynamic";

const CreateBody = z.object({
  name: z.string().min(1).max(80),
  platform: z.enum(COMMERCE_PLATFORMS).default("custom"),
});

export async function GET(req: Request) {
  // custom_integrations is an Enterprise (tier 3) capability. Gate at the data
  // boundary — connected-integration rows include provider metadata.
  const g = await apiGate("custom_integrations", "settings");
  if (g.response) return g.response;
  const user = { id: g.uid! };

  const rows = await (prisma as any).commerceIntegration.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { events: true, orders: true } },
    },
  });

  const origin = new URL(req.url).origin;
  return NextResponse.json({
    ok: true,
    items: rows.map((row: any) => ({ ...publicIntegration(row, origin), counts: row._count })),
  });
}

export async function POST(req: Request) {
  const g = await apiGate("custom_integrations", "settings");
  if (g.response) return g.response;
  const user = { id: g.uid! };

  const limited = enforceRateLimit(req, { name: "commerce-integration-create", identifier: user.id, ...RATE_LIMITS.api });
  if (limited) return limited;

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const result = await createCommerceIntegration({
    userId: user.id,
    name: parsed.data.name,
    platform: parsed.data.platform,
  });

  // Audit the connection — NEVER the returned credentials (raw key/secret).
  void auditCtx(await getAuthContext(), "integration.connected", {
    userId: user.id,
    targetType: "integration",
    targetId: result.integration.id,
    metadata: { name: parsed.data.name, platform: parsed.data.platform },
    req,
  });

  return NextResponse.json({
    ok: true,
    integration: publicIntegration(result.integration, new URL(req.url).origin),
    credentials: result.credentials,
  });
}
