/**
 * Lightweight owner-scoped customer search for pickers (e.g. the merge-
 * duplicate-customer dialog). Not the full list endpoint — small result set,
 * name/phone only.
 *
 * GET /api/customers/search?q=<text> → { customers: { id, name, phone }[] }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const uid = await getUserIdForPermission("customers");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim() || "";
  if (!q) return NextResponse.json({ customers: [] });

  const customers = await prisma.customer.findMany({
    where: { userId: uid, OR: [{ name: { contains: q } }, { phone: { contains: q } }] },
    select: { id: true, name: true, phone: true },
    orderBy: { lastSeenAt: "desc" },
    take: 8,
  });
  return NextResponse.json({ customers });
}
