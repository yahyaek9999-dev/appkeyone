/**
 * Admin: full effective entitlement diagnostic for a customer.
 *   GET /api/admin/users/[userId]/entitlements
 *
 * Returns the layered entitlement breakdown plus "why is X off?" for every
 * disabled capability. Used by Admin Commercial Control Center / Customer 360.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { getEntitlements, featureOffReason } from "@/lib/membership/entitlements";
import { CAPABILITIES } from "@/lib/pricing/catalog";

export const dynamic = "force-dynamic";

type Ctx = { params: { userId: string } };

export async function GET(_req: Request, ctx: Ctx) {
  try { await requireAdmin(); }
  catch { return NextResponse.json({ error: "غير مصرح" }, { status: 401 }); }

  const { userId } = ctx.params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const ent = await getEntitlements(userId);

  // Collect "why is this off?" for every disabled capability
  const offReasons: Record<string, string | null> = {};
  const disabledCaps = CAPABILITIES.filter((c) => !ent.capabilities[c.key]);
  await Promise.all(
    disabledCaps.map(async (c) => {
      offReasons[c.key] = await featureOffReason(userId, c.key);
    }),
  );

  return NextResponse.json({
    ok: true,
    user,
    entitlements: {
      ...ent,
      offReasons,
    },
  });
}
