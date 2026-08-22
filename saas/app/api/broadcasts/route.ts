import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission, getAuthContext } from "@/lib/auth";
import { auditCtx } from "@/lib/audit/log";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { apiGate } from "@/lib/membership/gate";
import { createBroadcastFromSettings, type BroadcastSettings } from "@/lib/broadcasts/create";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await apiGate("broadcasts");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const items = await prisma.broadcast.findMany({
    where: { userId: uid },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const gate = await apiGate("broadcasts");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  // Abuse guard: cap how often a workspace can fire broadcast-create. The
  // monthly plan cap still applies downstream; this is a per-minute burst gate.
  const limited = enforceRateLimit(req, { name: "broadcast-create", identifier: uid, ...RATE_LIMITS.api });
  if (limited) return limited;

  let body: any = {};
  try { body = await req.json(); } catch {}

  const title = String(body.title || "حملة بدون عنوان").trim().slice(0, 120);
  const template = String(body.template || "").trim();
  const audience = String(body.audience || "all");
  // Safe-by-default: only personalize when the merchant explicitly opts in.
  // Previously this defaulted to `true` which silently rewrote every message
  // through the LLM — confusing merchants who expected their exact text.
  const personalize = body.personalize === true;

  // ---- Smart Campaign extras (all optional, additive) ----
  const couponCode = body.couponCode ? String(body.couponCode).trim().slice(0, 60) : null;
  const imageUrl =
    typeof body.imageUrl === "string" && /^https?:\/\/\S+$/i.test(body.imageUrl.trim())
      ? body.imageUrl.trim().slice(0, 500)
      : null;
  // Schedule: a valid future ISO timestamp holds the campaign until due. Past
  // or missing → send immediately (scheduledAt stays null, exactly like today).
  let scheduledAt: Date | null = null;
  if (body.scheduledAt) {
    const d = new Date(body.scheduledAt);
    if (!isNaN(d.getTime()) && d.getTime() > Date.now() + 30_000) scheduledAt = d;
  }
  const audienceOpts = {
    inactiveDays: body.inactiveDays != null ? Number(body.inactiveDays) : undefined,
    from: body.from || null,
    to: body.to || null,
  };

  const settings: BroadcastSettings = {
    title,
    template,
    audience,
    personalize,
    couponCode,
    imageUrl,
    scheduledAt,
    audienceOpts,
  };

  const result = await createBroadcastFromSettings(uid, settings);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, reason: result.reason, used: result.used, cap: result.cap, balance: result.balance,
        ...(result.status === 402 ? { code: "insufficient_balance" } : {}) },
      { status: result.status },
    );
  }

  void auditCtx(await getAuthContext(), "broadcast.created", {
    userId: uid,
    targetType: "broadcast",
    targetId: result.broadcast.id,
    metadata: { title, audience, recipients: result.broadcast.total },
    req,
  });

  return NextResponse.json({ ok: true, broadcast: result.broadcast, skipped: result.skipped });
}
