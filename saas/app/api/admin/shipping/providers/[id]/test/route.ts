// POST /api/admin/shipping/providers/[id]/test  (Phase 2 — test connection)
import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { testProviderConnection } from "@/lib/shipping";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
  }
  const provider = await (prisma as any).shippingProvider.findUnique({ where: { id: params.id } });
  if (!provider) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const result = await testProviderConnection(provider);
  await (prisma as any).shippingProvider
    .update({
      where: { id: params.id },
      data: { lastTestAt: new Date(), lastTestOk: result.ok },
    })
    .catch(() => {});
  return NextResponse.json({ ok: result.ok, detail: result.detail });
}
