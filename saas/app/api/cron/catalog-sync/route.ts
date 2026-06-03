import { NextResponse } from "next/server";
import { runCatalogSync } from "@/lib/commerce/catalog-sync";

export const dynamic = "force-dynamic";

const SECRET =
  process.env.SAAS_INTERNAL_SECRET || "dev-internal-secret-change-me";

/**
 * Catalog sync cron (Agent 3, Task #10).
 *
 * Pulls product catalogs from connected Shopify / WooCommerce / Salla / Zid
 * stores and upserts into the local Product table. Read-only on commerce
 * platforms; idempotent; failures dead-letter to integration.lastSyncError.
 *
 * Suggested cadence: every 6 hours or on-demand after a store connection.
 *
 * Query params (optional):
 *   ?userId=...            scope to a single merchant
 *   ?maxIntegrations=N    cap integrations per run (default 100)
 */
export async function POST(req: Request) {
  if (req.headers.get("x-internal-secret") !== SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") || undefined;
  const maxIntegrations = Number(url.searchParams.get("maxIntegrations")) || undefined;

  try {
    const result = await runCatalogSync({ userId, maxIntegrations });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "catalog_sync_failed" },
      { status: 500 },
    );
  }
}
