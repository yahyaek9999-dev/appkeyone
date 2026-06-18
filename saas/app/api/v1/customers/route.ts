/**
 * Public API v1 — customers.
 *   GET /api/v1/customers?limit=50&cursor=<id> — paginated list of the
 *   authenticated tenant's customers.
 *
 * Auth is via API key (Authorization: Bearer <key>), NOT a session cookie.
 * The tenant is DERIVED from the key, so the WHERE clause is always scoped to
 * the key's owner — no cross-tenant reads. Scope required: "customers:read".
 *
 * Pagination: cursor is the last customer id from the previous page. `limit`
 * is clamped to [1,100] (default 50). `nextCursor` is null on the last page.
 */
import { NextResponse } from "next/server";
import { withApiKey } from "@/lib/developer/api-gate";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withApiKey(req, "customers:read", async (id) => {
    const url = new URL(req.url);
    const rawLimit = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 50;
    const cursor = url.searchParams.get("cursor") || undefined;

    // Fetch limit+1 to know whether there is a next page.
    const rows = await prisma.customer.findMany({
      where: { userId: id.userId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, name: true, phone: true, createdAt: true, leadScore: true },
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null;

    return NextResponse.json({
      data,
      pagination: { limit, nextCursor, hasMore },
    });
  });
}
