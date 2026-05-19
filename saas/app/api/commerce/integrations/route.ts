import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
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
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

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
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const limited = enforceRateLimit(req, { name: "commerce-integration-create", identifier: user.id, ...RATE_LIMITS.api });
  if (limited) return limited;

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const result = await createCommerceIntegration({
    userId: user.id,
    name: parsed.data.name,
    platform: parsed.data.platform,
  });

  return NextResponse.json({
    ok: true,
    integration: publicIntegration(result.integration, new URL(req.url).origin),
    credentials: result.credentials,
  });
}
