/**
 * Owner API-key management (Developer Center).
 *   GET  /api/developer/keys — list the tenant's API keys (hash redacted by engine)
 *   POST /api/developer/keys — create a key; returns the plaintext ONCE.
 *        body: { name?, scopes?: string[], rateLimitPerMin?, expiresAt? }
 *
 * Owner-only + plan-gated: requires the "settings" permission AND the
 * "api_access" capability (k_scale+). All mutations are tenant-scoped by the
 * engine, so there is no cross-tenant access.
 */
import { NextResponse } from "next/server";
import { apiGate } from "@/lib/membership/gate";
import { listApiKeys, createApiKey } from "@/lib/developer/keys";

export const dynamic = "force-dynamic";

const ALLOWED_SCOPES = new Set(["read", "customers:read", "customers:write", "broadcasts:read"]);

export async function GET() {
  const g = await apiGate("api_access", "settings");
  if (g.response) return g.response;
  const uid = g.uid!;

  try {
    const keys = await listApiKeys(uid);
    return NextResponse.json({ ok: true, keys });
  } catch (e: any) {
    return NextResponse.json({ error: "keys_unavailable", detail: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const g = await apiGate("api_access", "settings");
  if (g.response) return g.response;
  const uid = g.uid!;

  let body: any = {};
  try { body = await req.json(); } catch {}

  const name = body.name ? String(body.name).slice(0, 80) : undefined;
  const scopes = Array.isArray(body.scopes)
    ? body.scopes.map(String).filter((s: string) => ALLOWED_SCOPES.has(s))
    : undefined;
  const rateLimitPerMin = Number.isFinite(Number(body.rateLimitPerMin)) ? Number(body.rateLimitPerMin) : undefined;
  let expiresAt: Date | null = null;
  if (body.expiresAt) {
    const d = new Date(body.expiresAt);
    if (!Number.isNaN(d.getTime())) expiresAt = d;
  }

  try {
    const { plaintext, key } = await createApiKey({
      userId: uid,
      name,
      scopes: scopes && scopes.length ? scopes : undefined,
      rateLimitPerMin,
      expiresAt,
    });
    // plaintext is shown ONCE — the client must store it now.
    return NextResponse.json({ ok: true, plaintext, key });
  } catch (e: any) {
    return NextResponse.json({ error: "create_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
