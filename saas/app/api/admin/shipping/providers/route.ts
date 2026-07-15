// GET/POST /api/admin/shipping/providers  (Phase 2 — admin shipping CRUD)
import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { SHIPPING_PROVIDER_TYPES, encryptProviderFields } from "@/lib/shipping";

export const dynamic = "force-dynamic";

function publicProvider(p: any) {
  return {
    id: p.id,
    type: p.type,
    name: p.name,
    enabled: p.enabled,
    isDefault: p.isDefault,
    hasCredentials: Boolean(p.apiKeyEnc),
    lastTestAt: p.lastTestAt,
    lastTestOk: p.lastTestOk,
    createdAt: p.createdAt,
  };
}

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
  }
  const rows = await (prisma as any).shippingProvider.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ ok: true, items: rows.map(publicProvider) });
}

const CreateBody = z.object({
  type: z.enum(SHIPPING_PROVIDER_TYPES),
  name: z.string().min(1).max(80),
  apiKey: z.string().max(2000).optional(),
  apiSecret: z.string().max(2000).optional(),
  account: z.string().max(200).optional(),
  enabled: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
  }
  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const created = await (prisma as any).shippingProvider.create({
    data: {
      type: parsed.data.type,
      name: parsed.data.name.trim(),
      enabled: parsed.data.enabled !== false,
      ...encryptProviderFields(parsed.data),
    },
  });
  return NextResponse.json({ ok: true, provider: publicProvider(created) });
}
