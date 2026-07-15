/**
 * Admin — all API keys across tenants (Developer Center oversight).
 *   GET /api/admin/api-keys — every key (hash redacted), enriched with the
 *       owner's email/name, plus the current abuse-detection flags.
 *
 * Admin-only (requireAdmin). Read-only; revocation lives in [id]/route.ts.
 */
import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { parseScopes } from "@/lib/developer/api-core";
import { detectAbuse } from "@/lib/developer/metering";

export const dynamic = "force-dynamic";

export async function GET() {
  try { await requireAdmin(); }
  catch (e) { return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) }); }

  try {
    const [keys, abuse] = await Promise.all([
      prisma.apiKey.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
      detectAbuse({ days: 1 }),
    ]);

    const userIds = Array.from(new Set(keys.map((k) => k.userId)));
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, name: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));
    const abuseByKey = new Map(abuse.map((a) => [a.apiKeyId, a]));

    const items = keys.map((k) => {
      const { keyHash, ...rest } = k; // redact the hash
      const u = userById.get(k.userId);
      const flag = abuseByKey.get(k.id);
      return {
        ...rest,
        scopesList: parseScopes(k.scopes),
        userEmail: u?.email || null,
        userName: u?.name || null,
        abuse: flag ? { requests: flag.requests, errors: flag.errors, errorRatePct: flag.errorRatePct, reasons: flag.reasons } : null,
      };
    });

    return NextResponse.json({ ok: true, items, abuse });
  } catch (e: any) {
    return NextResponse.json({ error: "keys_unavailable", detail: String(e?.message || e) }, { status: 500 });
  }
}
