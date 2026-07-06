/**
 * GET /api/import/results — final results of the tenant's one-time import.
 *   → { ok, session, counts, customers, memoriesBuilt }
 *     counts:        contacts/conversations/messages/customers/memories from the session.
 *     customers:     up to 50 imported (historicalImported) customers — id/name/phone/createdAt.
 *     memoriesBuilt: # of CustomerMemory rows attached to this tenant's imported customers.
 *
 * Owner-only: gated by the "customers" permission.
 */
import { NextResponse } from "next/server";
import { getUserForPermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getImportSession } from "@/lib/import/import-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUserForPermission("customers");
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const session = await getImportSession(user.id);

    const [customers, memoriesBuilt] = await Promise.all([
      prisma.customer.findMany({
        where: { userId: user.id, historicalImported: true },
        take: 50,
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, phone: true, createdAt: true },
      }),
      prisma.customerMemory.count({
        where: { customer: { userId: user.id, historicalImported: true } },
      }),
    ]);

    const counts = {
      contactsFound: session?.contactsFound ?? 0,
      contactsImported: session?.contactsImported ?? 0,
      conversationsImported: session?.conversationsImported ?? 0,
      messagesImported: session?.messagesImported ?? 0,
      customersCreated: session?.customersCreated ?? 0,
      memoriesBuilt: session?.memoriesBuilt ?? 0,
    };

    return NextResponse.json({ ok: true, session, counts, customers, memoriesBuilt });
  } catch (e: any) {
    return NextResponse.json({ error: "results_unavailable", detail: String(e?.message || e) }, { status: 500 });
  }
}
