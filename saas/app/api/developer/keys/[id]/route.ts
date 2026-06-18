/**
 * Owner API-key lifecycle by id (Developer Center).
 *   PATCH  /api/developer/keys/:id — update { name?, scopes?, rateLimitPerMin? }
 *   POST   /api/developer/keys/:id — { action: "rotate" } → returns new plaintext ONCE
 *   DELETE /api/developer/keys/:id — revoke the key
 *
 * Owner-only + plan-gated ("settings" + "api_access"). Every operation is
 * tenant-scoped by the engine (WHERE {id,userId}) — no IDOR.
 */
import { NextResponse } from "next/server";
import { apiGate } from "@/lib/membership/gate";
import { getUserForPermission } from "@/lib/auth";
import { updateApiKey, rotateApiKey, revokeApiKey } from "@/lib/developer/keys";

export const dynamic = "force-dynamic";

const ALLOWED_SCOPES = new Set(["read", "customers:read", "customers:write", "broadcasts:read"]);

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await apiGate("api_access", "settings");
  if (g.response) return g.response;
  const uid = g.uid!;
  const actorEmail = (await getUserForPermission("settings"))?.email || null;

  let body: any = {};
  try { body = await req.json(); } catch {}

  const patch: { name?: string; scopes?: string[]; rateLimitPerMin?: number } = {};
  if (body.name !== undefined) patch.name = String(body.name).slice(0, 80);
  if (Array.isArray(body.scopes)) patch.scopes = body.scopes.map(String).filter((s: string) => ALLOWED_SCOPES.has(s));
  if (body.rateLimitPerMin !== undefined && Number.isFinite(Number(body.rateLimitPerMin))) {
    patch.rateLimitPerMin = Number(body.rateLimitPerMin);
  }

  try {
    const updated = await updateApiKey(uid, params.id, patch, actorEmail);
    if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, key: updated });
  } catch (e: any) {
    return NextResponse.json({ error: "update_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await apiGate("api_access", "settings");
  if (g.response) return g.response;
  const uid = g.uid!;
  const actorEmail = (await getUserForPermission("settings"))?.email || null;

  let body: any = {};
  try { body = await req.json(); } catch {}

  if (String(body.action) === "rotate") {
    try {
      const res = await rotateApiKey(uid, params.id, actorEmail);
      if (!res) return NextResponse.json({ error: "not_found" }, { status: 404 });
      // New plaintext shown ONCE.
      return NextResponse.json({ ok: true, plaintext: res.plaintext, key: res.key });
    } catch (e: any) {
      return NextResponse.json({ error: "rotate_failed", detail: String(e?.message || e) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await apiGate("api_access", "settings");
  if (g.response) return g.response;
  const uid = g.uid!;
  const actorEmail = (await getUserForPermission("settings"))?.email || null;

  try {
    const ok = await revokeApiKey(uid, params.id, actorEmail);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "revoke_failed", detail: String(e?.message || e) }, { status: 500 });
  }
}
