/**
 * POST /api/commerce/integrations/[id]/verify — REAL connection test.
 * Makes one authenticated, read-only API call to the merchant's store with the
 * stored credentials and records connectionStatus = healthy | failed. This is the
 * "Test Connection" the merchant clicks after entering credentials.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { readIntegrationConfig } from "@/lib/commerce/catalog-sync";
import { assertPublicHttpUrl } from "@/lib/ssrf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function ping(url: string, headers: Record<string, string>): Promise<{ ok: boolean; status: number; detail: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const r = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: ctrl.signal });
    const ok = r.status >= 200 && r.status < 300;
    return { ok, status: r.status, detail: ok ? "connected" : `http_${r.status}` };
  } catch (e: any) {
    return { ok: false, status: 0, detail: String(e?.message || e).slice(0, 160) };
  } finally {
    clearTimeout(t);
  }
}

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  let user;
  try { user = await requirePermission("settings"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const limited = enforceRateLimit(_req, { name: "commerce-integration-verify", identifier: user.id, ...RATE_LIMITS.api });
  if (limited) return limited;

  const integ = await (prisma as any).commerceIntegration.findFirst({
    where: { id: ctx.params.id, userId: user.id },
    select: { id: true, platform: true, storeUrl: true, configJson: true },
  });
  if (!integ) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const cfg = readIntegrationConfig(integ.configJson);
  const storeUrl = (integ.storeUrl || "").replace(/\/$/, "");
  const platform = String(integ.platform || "").toLowerCase();

  let res: { ok: boolean; status: number; detail: string };
  try {
    if (platform === "shopify") {
      if (!storeUrl || !cfg.accessToken) throw new Error("missing_credentials: storeUrl + accessToken");
      assertPublicHttpUrl(storeUrl);
      res = await ping(`${storeUrl}/admin/api/2024-01/shop.json`, { "X-Shopify-Access-Token": String(cfg.accessToken) });
    } else if (platform === "woocommerce") {
      if (!storeUrl || !cfg.consumerKey || !cfg.consumerSecret) throw new Error("missing_credentials: storeUrl + consumerKey + consumerSecret");
      assertPublicHttpUrl(storeUrl);
      const auth = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64");
      res = await ping(`${storeUrl}/wp-json/wc/v3/products?per_page=1`, { Authorization: `Basic ${auth}` });
    } else if (platform === "salla") {
      if (!cfg.accessToken) throw new Error("missing_credentials: accessToken");
      res = await ping(`https://api.salla.dev/admin/v2/products?per_page=1`, { Authorization: `Bearer ${cfg.accessToken}` });
    } else if (platform === "zid") {
      if (!cfg.accessToken || !cfg.storeId) throw new Error("missing_credentials: accessToken + storeId");
      res = await ping(`https://api.zid.sa/v1/products?per_page=1`, { Authorization: `Bearer ${cfg.accessToken}`, "Store-Id": String(cfg.storeId) });
    } else {
      return NextResponse.json({ error: "platform_not_verifiable", message: "هذه المنصة لا تدعم اختبار الاتصال التلقائي." }, { status: 400 });
    }
  } catch (e: any) {
    res = { ok: false, status: 0, detail: String(e?.message || e).slice(0, 160) };
  }

  await (prisma as any).commerceIntegration.update({
    where: { id: integ.id },
    data: {
      connectionStatus: res.ok ? "healthy" : "failed",
      lastTestAt: new Date(),
      lastSyncError: res.ok ? null : res.detail,
    },
  });

  return NextResponse.json({ ok: res.ok, status: res.status, detail: res.detail, connectionStatus: res.ok ? "healthy" : "failed" });
}
