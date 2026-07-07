// POST /api/bridge/v1/device/token — RFC 8628 token exchange w/ PKCE (Cloud).
//
// Bridge-facing polling endpoint. The Bridge posts { device_code, code_verifier }
// on an interval. While the owner hasn't approved in the browser we return
// {error:"authorization_pending"} (400, RFC 8628 style). Once approved we verify
// PKCE (sha256(verifier) == stored challenge), consume the code ONE time, and
// provision the workspace's Bridge:
//   - Bridge row (userId, name, status:"offline", tokenHash)
//   - BridgeToken row (rotation/reuse-detection ledger; hash only)
//   - BridgeTransport rows for the providers negotiated at device/start
// The raw bridge_token + derived heartbeat_secret are returned ONCE and never
// stored in the clear — the Cloud persists only sha256(bridge_token).
//
// Gated: 404 when BRIDGE_ENABLED is off. No session auth (Bridge has no account);
// possession of the device_code + matching PKCE verifier is the credential.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { bridgeEnabled } from "@/lib/bridge/flags";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  deriveHeartbeatSecret,
  pkceS256,
  randomToken,
  sha256Hex,
  timingSafeEqualHex,
} from "@/lib/bridge/crypto";

export const dynamic = "force-dynamic";

const TokenBody = z.object({
  device_code: z.string().min(20).max(200),
  code_verifier: z.string().min(20).max(200),
});

export async function POST(req: Request) {
  if (!bridgeEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const limited = enforceRateLimit(req, { name: "bridge-device-token", ...RATE_LIMITS.api });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = TokenBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.message }, { status: 400 });
  }

  const now = new Date();
  const code = await (prisma as any).bridgeAuthCode.findUnique({
    where: { deviceCode: parsed.data.device_code },
  });

  // Unknown device_code.
  if (!code) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }
  // Expired.
  if (code.expiresAt <= now) {
    return NextResponse.json({ error: "expired_token" }, { status: 400 });
  }
  // Already exchanged — reject reuse of a consumed device_code.
  if (code.consumed) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }
  // Owner hasn't approved in the browser yet — keep polling.
  if (!code.approved || !code.userId) {
    return NextResponse.json({ error: "authorization_pending" }, { status: 400 });
  }

  // PKCE proof-of-possession: sha256(verifier) must equal the stored challenge.
  const expectedChallenge = pkceS256(parsed.data.code_verifier);
  // Constant-time compare on the sha256-hex of each to avoid length/timing leaks.
  if (!timingSafeEqualHex(sha256Hex(expectedChallenge), sha256Hex(code.codeChallenge))) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  const userId: string = code.userId;
  const bridgeToken = randomToken(32);
  const tokenHash = sha256Hex(bridgeToken);

  // Providers negotiated at device/start are stored on the auth code? They are
  // not (schema keeps the code minimal), so provision transports lazily — the
  // Bridge announces providers again at hello (Phase 2). Here we create the
  // Bridge + first token atomically and consume the code exactly once.
  const provisioned = await prisma.$transaction(async (tx) => {
    // Atomically consume the code; if another concurrent poll won the race,
    // updateMany affects 0 rows and we bail (reuse detection).
    const consume = await (tx as any).bridgeAuthCode.updateMany({
      where: { id: code.id, consumed: false },
      data: { consumed: true },
    });
    if (consume.count !== 1) {
      return null; // lost the race — treat as already-exchanged
    }

    // Supersede this MACHINE's previous registration(s): a fresh login for the
    // same host replaces its old bridge so the Dashboard shows exactly ONE active
    // bridge per machine (no accumulating ghost rows, no "device disappears"
    // churn). Different machines (different names) are untouched. Their tokens are
    // revoked too so a stale daemon can no longer reconnect.
    const supersedeName: string | null = code.bridgeName || null;
    const stale = await (tx as any).bridge.findMany({
      where: { userId, revokedAt: null, name: supersedeName },
      select: { id: true },
    });
    if (stale.length) {
      const ids = stale.map((s: { id: string }) => s.id);
      await (tx as any).bridge.updateMany({
        where: { id: { in: ids } },
        data: { revokedAt: now, status: "offline", isPrimary: false },
      });
      await (tx as any).bridgeToken.updateMany({
        where: { bridgeId: { in: ids }, revokedAt: null },
        data: { revokedAt: now },
      });
    }

    // Guarantee the workspace always has a routable primary: if no other
    // non-revoked primary remains, this new bridge becomes primary.
    const primaryCount = await (tx as any).bridge.count({
      where: { userId, revokedAt: null, isPrimary: true },
    });

    const bridge = await (tx as any).bridge.create({
      data: {
        userId,
        name: code.bridgeName || null,
        status: "offline",
        tokenHash,
        isPrimary: primaryCount === 0,
      },
    });

    await (tx as any).bridgeToken.create({
      data: {
        bridgeId: bridge.id,
        tokenHash,
        prevHash: null,
      },
    });

    return bridge as { id: string };
  });

  if (!provisioned) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  const heartbeatSecret = deriveHeartbeatSecret(bridgeToken, provisioned.id);

  return NextResponse.json({
    bridge_id: provisioned.id,
    bridge_token: bridgeToken, // shown ONCE — Cloud stores only sha256(bridge_token)
    heartbeat_secret: heartbeatSecret,
    workspace_id: userId,
  });
}
