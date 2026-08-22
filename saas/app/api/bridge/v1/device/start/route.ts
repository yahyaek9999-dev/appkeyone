// POST /api/bridge/v1/device/start — RFC 8628 Device Authorization Grant (Cloud).
//
// Bridge-facing. A Bridge daemon (no local KEYONE account) begins linking by
// posting a PKCE S256 code_challenge + the providers it can host. We mint an
// opaque device_code (polled at device/token) and a short human user_code (typed
// by the workspace owner in the browser at the verification_uri). We store only
// sha256(user_code) — the raw code lives only in this response.
//
// Gated: 404 when BRIDGE_ENABLED is off. No auth (the Bridge has no token yet).

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiGate } from "@/lib/membership/gate";
import { bridgeEnabled } from "@/lib/bridge/flags";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { randomDeviceCode, randomUserCode, sha256Hex } from "@/lib/bridge/crypto";

export const dynamic = "force-dynamic";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const POLL_INTERVAL_SEC = 5;
const VERIFICATION_URI = "/dashboard/settings/bridge/link";

const StartBody = z.object({
  name: z.string().max(120).optional(),
  // PKCE S256 challenge = BASE64URL(SHA256(verifier)); 43 chars for a 32-byte
  // verifier. Accept a reasonable range so future verifier sizes still work.
  codeChallenge: z.string().min(20).max(200),
  providers: z.array(z.string().max(40)).min(1).max(16),
});

export async function POST(req: Request) {
  if (!bridgeEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const gate = await apiGate("whatsapp_bridge");
  if (gate.response) return gate.response;

  const limited = enforceRateLimit(req, { name: "bridge-device-start", ...RATE_LIMITS.api });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = StartBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_body", detail: parsed.error.message }, { status: 400 });
  }

  const deviceCode = randomDeviceCode();
  const userCode = randomUserCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await (prisma as any).bridgeAuthCode.create({
    data: {
      deviceCode,
      userCodeHash: sha256Hex(userCode),
      codeChallenge: parsed.data.codeChallenge,
      bridgeName: parsed.data.name?.trim() || null,
      approved: false,
      consumed: false,
      expiresAt,
    },
  });

  return NextResponse.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: VERIFICATION_URI,
    interval: POLL_INTERVAL_SEC,
    expires_in: Math.floor(CODE_TTL_MS / 1000),
  });
}
