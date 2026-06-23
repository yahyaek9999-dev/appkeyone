// Bi-directional commerce sync — catalog pull (Agent 3, Task #10).
//
// Pulls the product catalog from a connected Shopify / WooCommerce / Salla / Zid
// store and upserts into the merchant's Product table using the new external key
// (sku + externalSource + externalId). Manually-created products are never
// touched (they have null externalSource). Idempotent: re-running updates in
// place. Failures dead-letter to the integration's lastSyncError — they never
// crash the caller.
//
// DESIGN DECISIONS:
//   - We make the outbound HTTP call using the merchant's stored storeUrl +
//     apiKeyHash / configJson. We decrypt nothing here; each platform adapter
//     reads the configJson fields the existing integration setup already stores.
//   - Rate limits are respected by capping max pages per run (PAGES_PER_RUN).
//   - Order status push is a separate, more invasive operation (requires OAuth
//     write scopes on platforms that distinguish read/write). It is documented
//     in the report as "follow-up task" requiring explicit platform OAuth flow
//     and is NOT implemented here to respect the additive-only boundary.
//
// ANTI-ABUSE: This code only ever READS from commerce platforms and WRITES to
// the local Product table. It never touches orders, wa.send, or any pipeline.

import { prisma } from "@/lib/db";
import { assertPublicHttpUrl } from "@/lib/ssrf";
import { decryptSecret } from "@/lib/crypto-util";

const PAGES_PER_RUN = 5;
const PAGE_SIZE     = 100;
const TIMEOUT_MS    = 15_000;

export interface CatalogSyncResult {
  integrationId: string;
  platform: string;
  synced: number;
  skipped: number;
  errors: string[];
}

// ── Normalised product shape ─────────────────────────────────────────────────

interface RawProduct {
  externalId: string;
  sku: string | null;
  name: string;
  description?: string | null;
  price: number;
  compareAtPrice?: number | null;
  stock?: number;
  category?: string | null;
  imageUrl?: string | null;
  active?: boolean;
  productLink?: string | null;
}

// ── Platform adapters ────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  // SSRF guard: storeUrl is merchant-supplied. Reject internal/loopback/metadata
  // targets before connecting so a malicious integration can't probe the VPS's
  // internal network (WA service, LLM, Redis, x-internal-secret endpoints).
  await assertPublicHttpUrl(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function* shopifyProducts(cfg: { storeUrl: string; accessToken: string }): AsyncGenerator<RawProduct> {
  let page = 0;
  let sinceId: string | null = null;
  while (page < PAGES_PER_RUN) {
    const url = `${cfg.storeUrl}/admin/api/2024-01/products.json?limit=${PAGE_SIZE}&fields=id,title,body_html,variants,images,product_type,status${sinceId ? `&since_id=${sinceId}` : ""}`;
    const r = await fetchWithTimeout(url, {
      headers: { "X-Shopify-Access-Token": cfg.accessToken, Accept: "application/json" },
    }).catch(() => null);
    if (!r?.ok) break;
    const j: any = await r.json().catch(() => null);
    const products: any[] = j?.products || [];
    if (!products.length) break;
    for (const p of products) {
      const variant = p.variants?.[0] || {};
      yield {
        externalId: String(p.id),
        sku: variant.sku || null,
        name: String(p.title || "منتج").slice(0, 200),
        description: p.body_html ? stripHtml(p.body_html).slice(0, 1000) : null,
        price: Math.round(Number(variant.price || 0)),
        compareAtPrice: variant.compare_at_price ? Math.round(Number(variant.compare_at_price)) : null,
        stock: Number(variant.inventory_quantity || 0),
        category: p.product_type || null,
        imageUrl: p.images?.[0]?.src || null,
        active: p.status === "active",
        productLink: null,
      };
    }
    sinceId = String(products[products.length - 1].id);
    page++;
    if (products.length < PAGE_SIZE) break;
  }
}

async function* woocommerceProducts(cfg: { storeUrl: string; consumerKey: string; consumerSecret: string }): AsyncGenerator<RawProduct> {
  const auth = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64");
  for (let page = 1; page <= PAGES_PER_RUN; page++) {
    const url = `${cfg.storeUrl}/wp-json/wc/v3/products?per_page=${PAGE_SIZE}&page=${page}&status=publish`;
    const r = await fetchWithTimeout(url, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    }).catch(() => null);
    if (!r?.ok) break;
    const products: any[] = await r.json().catch(() => []);
    if (!products.length) break;
    for (const p of products) {
      yield {
        externalId: String(p.id),
        sku: p.sku || null,
        name: String(p.name || "منتج").slice(0, 200),
        description: p.short_description ? stripHtml(p.short_description).slice(0, 1000) : null,
        price: Math.round(Number(p.price || p.regular_price || 0)),
        compareAtPrice: p.regular_price && p.sale_price ? Math.round(Number(p.regular_price)) : null,
        stock: Number(p.stock_quantity || 0),
        category: p.categories?.[0]?.name || null,
        imageUrl: p.images?.[0]?.src || null,
        active: p.status === "publish" && p.catalog_visibility !== "hidden",
        productLink: p.permalink || null,
      };
    }
    if (products.length < PAGE_SIZE) break;
  }
}

async function* sallaProducts(cfg: { accessToken: string }): AsyncGenerator<RawProduct> {
  for (let page = 1; page <= PAGES_PER_RUN; page++) {
    const r = await fetchWithTimeout(`https://api.salla.dev/admin/v2/products?per_page=${PAGE_SIZE}&page=${page}`, {
      headers: { Authorization: `Bearer ${cfg.accessToken}`, Accept: "application/json" },
    }).catch(() => null);
    if (!r?.ok) break;
    const j: any = await r.json().catch(() => null);
    const products: any[] = j?.data || [];
    if (!products.length) break;
    for (const p of products) {
      yield {
        externalId: String(p.id),
        sku: p.sku || null,
        name: String(p.name || "منتج").slice(0, 200),
        description: null,
        price: Math.round(Number(p.price?.amount || p.price || 0)),
        compareAtPrice: null,
        stock: Number(p.quantity || 0),
        category: p.category?.name || null,
        imageUrl: p.thumbnail || p.image?.url || null,
        active: p.status === "sale" || p.status === "available",
        productLink: p.url || null,
      };
    }
    if (products.length < PAGE_SIZE) break;
  }
}

async function* zidProducts(cfg: { accessToken: string; storeId: string }): AsyncGenerator<RawProduct> {
  for (let page = 1; page <= PAGES_PER_RUN; page++) {
    const r = await fetchWithTimeout(`https://api.zid.sa/v1/products?per_page=${PAGE_SIZE}&page=${page}`, {
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Store-Id": cfg.storeId,
        Accept: "application/json",
      },
    }).catch(() => null);
    if (!r?.ok) break;
    const j: any = await r.json().catch(() => null);
    const products: any[] = j?.products || j?.data || [];
    if (!products.length) break;
    for (const p of products) {
      yield {
        externalId: String(p.id),
        sku: p.sku || null,
        name: String(p.name?.ar || p.name?.en || p.name || "منتج").slice(0, 200),
        description: null,
        price: Math.round(Number(p.price || 0)),
        compareAtPrice: p.old_price ? Math.round(Number(p.old_price)) : null,
        stock: Number(p.quantity || 0),
        category: null,
        imageUrl: p.images?.[0]?.url || null,
        active: p.status === 1 || p.status === "active",
        productLink: null,
      };
    }
    if (products.length < PAGE_SIZE) break;
  }
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

function parseConfig(raw: unknown): Record<string, any> {
  const s = String(raw || "{}");
  // Credentials are stored AES-256-GCM encrypted (integration PATCH route).
  // Decrypt first; fall back to plaintext JSON for any legacy rows.
  try { return JSON.parse(decryptSecret(s)) || {}; }
  catch { try { return JSON.parse(s) || {}; } catch { return {}; } }
}

/** Public shape of the config for the engine + a verifier (decrypts once). */
export function readIntegrationConfig(raw: unknown): Record<string, any> {
  return parseConfig(raw);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function syncCatalogForIntegration(
  integrationId: string,
): Promise<CatalogSyncResult> {
  const integration = await (prisma as any).commerceIntegration
    .findUnique({ where: { id: integrationId } })
    .catch(() => null);

  if (!integration || !integration.enabled) {
    return { integrationId, platform: "unknown", synced: 0, skipped: 0, errors: ["integration_not_found_or_disabled"] };
  }

  const { userId, platform, storeUrl, configJson } = integration;
  const cfg = parseConfig(configJson);
  const result: CatalogSyncResult = { integrationId, platform, synced: 0, skipped: 0, errors: [] };

  let generator: AsyncGenerator<RawProduct> | null = null;

  try {
    const p = String(platform || "").toLowerCase();
    if (p === "shopify" && cfg.accessToken && storeUrl) {
      generator = shopifyProducts({ storeUrl, accessToken: cfg.accessToken });
    } else if (p === "woocommerce" && cfg.consumerKey && cfg.consumerSecret && storeUrl) {
      generator = woocommerceProducts({ storeUrl, consumerKey: cfg.consumerKey, consumerSecret: cfg.consumerSecret });
    } else if (p === "salla" && cfg.accessToken) {
      generator = sallaProducts({ accessToken: cfg.accessToken });
    } else if (p === "zid" && cfg.accessToken && cfg.storeId) {
      generator = zidProducts({ accessToken: cfg.accessToken, storeId: cfg.storeId });
    } else {
      result.errors.push(`platform_not_supported_or_missing_credentials:${p}`);
      return result;
    }

    for await (const product of generator) {
      try {
        await (prisma as any).product.upsert({
          where: {
            userId_externalSource_externalId: {
              userId,
              externalSource: platform,
              externalId: product.externalId,
            },
          },
          create: {
            userId,
            name: product.name,
            description: product.description || null,
            price: product.price,
            compareAtPrice: product.compareAtPrice || null,
            stock: product.stock ?? 0,
            category: product.category || null,
            imageUrl: product.imageUrl || null,
            active: product.active !== false,
            productLink: product.productLink || null,
            sku: product.sku,
            externalSource: platform,
            externalId: product.externalId,
            lastSyncedAt: new Date(),
          },
          update: {
            name: product.name,
            description: product.description || null,
            price: product.price,
            compareAtPrice: product.compareAtPrice || null,
            stock: product.stock ?? 0,
            category: product.category || null,
            imageUrl: product.imageUrl || null,
            active: product.active !== false,
            productLink: product.productLink || null,
            sku: product.sku,
            lastSyncedAt: new Date(),
          },
        });
        result.synced++;
      } catch (e: any) {
        result.skipped++;
        if (result.errors.length < 10) result.errors.push(e?.message?.slice(0, 120) || "upsert_failed");
      }
    }

    await (prisma as any).commerceIntegration.update({
      where: { id: integrationId },
      data: { lastSyncAt: new Date(), lastSyncStatus: `synced:${result.synced}`, lastSyncError: null },
    }).catch(() => {});
  } catch (e: any) {
    const err = e?.message?.slice(0, 300) || "catalog_sync_failed";
    result.errors.push(err);
    await (prisma as any).commerceIntegration.update({
      where: { id: integrationId },
      data: { lastSyncError: err },
    }).catch(() => {});
  }

  return result;
}

/** Sync all enabled integrations for a merchant (or all merchants). */
export async function runCatalogSync(opts: {
  userId?: string;
  maxIntegrations?: number;
} = {}): Promise<{ integrations: number; synced: number; errors: number }> {
  const max = Math.max(1, Math.min(500, opts.maxIntegrations || 100));

  const integrations = await (prisma as any).commerceIntegration
    .findMany({
      where: {
        enabled: true,
        platform: { in: ["shopify", "woocommerce", "salla", "zid"] },
        ...(opts.userId ? { userId: opts.userId } : {}),
      },
      take: max,
      select: { id: true },
    })
    .catch(() => []);

  let synced = 0;
  let errors = 0;
  for (const row of integrations as any[]) {
    const r = await syncCatalogForIntegration(row.id);
    synced += r.synced;
    if (r.errors.length) errors++;
  }

  return { integrations: (integrations as any[]).length, synced, errors };
}
