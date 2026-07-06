// POST /api/bridge/v1/device/approve — RFC 8628 user-approval step (Cloud).
//
// USER-facing. The workspace owner (or a member with "settings") types the short
// user_code shown on their Bridge into the dashboard; this endpoint binds the
// pending device authorization to their workspace (userId = owner). The Bridge's
// next device/token poll then succeeds.
//
// Gated: 404 when BRIDGE_ENABLED is off. Auth: requirePermission("settings").

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, authErrorStatus } from "@/lib/auth";
import { bridgeEnabled } from "@/lib/bridge/flags";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { sha256Hex } from "@/lib/bridge/crypto";

export const dynamic = "force-dynamic";

const ApproveBody = z.object({
  user_code: z.string().min(4).max(40),
});

export async function POST(req: Request) {
  if (!bridgeEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let user;
  try {
    user = await requirePermission("settings");
  } catch (e) {
    return NextResponse.json({ error: "unauthorized" }, { status: authErrorStatus(e) });
  }

  const limited = enforceRateLimit(req, { name: "bridge-device-approve", ...RATE_LIMITS.api });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = ApproveBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_body", detail: parsed.error.message }, { status: 400 });
  }

  // Normalize what the user typed (case / whitespace) before hashing so the
  // lookup matches the code we generated. user_code alphabet is upper-case.
  const normalized = parsed.data.user_code.trim().toUpperCase();
  const userCodeHash = sha256Hex(normalized);

  const now = new Date();
  const code = await (prisma as any).bridgeAuthCode.findFirst({
    where: {
      userCodeHash,
      consumed: false,
      expiresAt: { gt: now },
    },
  });

  if (!code) {
    // Wrong / expired / already-used code. Do not disclose which.
    return NextResponse.json({ error: "invalid_or_expired_code" }, { status: 400 });
  }

  // Idempotent: approving an already-approved-but-unconsumed code by the same
  // workspace is fine. Re-approving one bound to another workspace is refused.
  if (code.approved && code.userId && code.userId !== user.id) {
    return NextResponse.json({ error: "already_claimed" }, { status: 409 });
  }

  await (prisma as any).bridgeAuthCode.update({
    where: { id: code.id },
    data: { approved: true, userId: user.id },
  });

  return NextResponse.json({ ok: true });
}
