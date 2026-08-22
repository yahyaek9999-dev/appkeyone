// POST /api/bridge/v1/token/rotate — rotating Bridge refresh token (Cloud).
//
// Bridge-facing. Authenticated by `Authorization: Bearer <bridge_token>`. We look
// up the token by sha256(token). On success we mint a NEW token, record the old
// hash as prevHash on the new BridgeToken row, revoke the old row, and update the
// Bridge.tokenHash pointer — all atomically. The new raw token is returned ONCE.
//
// Reuse detection: presenting a token whose row is already revoked means the
// token leaked and was replayed after a legitimate rotation. We refuse (401) and
// (defensively) revoke the whole Bridge so a thief can't ride a stolen token.
//
// Gated: 404 when BRIDGE_ENABLED is off.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiGate } from "@/lib/membership/gate";
import { bridgeEnabled } from "@/lib/bridge/flags";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { parseBearer, randomToken, sha256Hex } from "@/lib/bridge/crypto";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!bridgeEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const gate = await apiGate("whatsapp_bridge");
  if (gate.response) return gate.response;

  const limited = enforceRateLimit(req, { name: "bridge-token-rotate", ...RATE_LIMITS.api });
  if (limited) return limited;

  const presented = parseBearer(req.headers.get("authorization"));
  if (!presented) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const presentedHash = sha256Hex(presented);
  const tokenRow = await (prisma as any).bridgeToken.findUnique({
    where: { tokenHash: presentedHash },
  });

  if (!tokenRow) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Reuse of an already-rotated (revoked) token → treat as compromise.
  if (tokenRow.revokedAt) {
    await (prisma as any).bridge.updateMany({
      where: { id: tokenRow.bridgeId, revokedAt: null },
      data: { revokedAt: new Date(), status: "offline" },
    });
    await (prisma as any).bridgeToken.updateMany({
      where: { bridgeId: tokenRow.bridgeId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return NextResponse.json({ error: "token_reuse_detected" }, { status: 401 });
  }

  // The Bridge itself may have been revoked by the owner.
  const bridge = await (prisma as any).bridge.findUnique({ where: { id: tokenRow.bridgeId } });
  if (!bridge || bridge.revokedAt) {
    return NextResponse.json({ error: "revoked" }, { status: 401 });
  }

  const newToken = randomToken(32);
  const newHash = sha256Hex(newToken);
  const nowTs = new Date();

  // Atomic rotate. The guarded revoke (revokedAt: null) is the concurrency lock:
  // if a parallel rotate already advanced the chain, count !== 1 and we throw
  // ROTATE_RACE, rolling back the whole transaction so no orphan token is minted.
  try {
    await prisma.$transaction(async (tx) => {
      const revoked = await (tx as any).bridgeToken.updateMany({
        where: { id: tokenRow.id, revokedAt: null },
        data: { revokedAt: nowTs, lastUsedAt: nowTs },
      });
      if (revoked.count !== 1) {
        throw new Error("ROTATE_RACE");
      }
      await (tx as any).bridgeToken.create({
        data: { bridgeId: tokenRow.bridgeId, tokenHash: newHash, prevHash: presentedHash },
      });
      await (tx as any).bridge.update({
        where: { id: tokenRow.bridgeId },
        data: { tokenHash: newHash },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "ROTATE_RACE") {
      // A concurrent rotation won; the presented token is now revoked. Ask the
      // Bridge to retry (it should re-read its stored token first).
      return NextResponse.json({ error: "conflict_retry" }, { status: 409 });
    }
    throw e;
  }

  return NextResponse.json({
    bridge_token: newToken, // shown ONCE
    bridge_id: tokenRow.bridgeId,
  });
}
