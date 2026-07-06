// lib/bridge/crypto.ts — KEYONE Bridge token/PKCE primitives (Cloud side).
//
// The Cloud NEVER stores a Bridge token, WhatsApp auth, session, or QR in the
// clear. It stores only SHA-256 hashes and derives the heartbeat secret via
// HMAC. Every helper here is additive and used exclusively by /api/bridge/v1/*.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Lower-case hex SHA-256 of a UTF-8 string. Used for token / user-code hashes. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * PKCE S256 challenge from a verifier: BASE64URL(SHA256(verifier)).
 * This matches what an RFC 7636 client computes, so the Bridge can send a raw
 * S256 code_challenge at device/start and prove possession with code_verifier
 * at device/token.
 */
export function pkceS256(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

/**
 * Derive the per-Bridge heartbeat secret from the (secret) bridge token and the
 * (public) bridge id. The Cloud stores only sha256(bridge_token); given a
 * presented token it can re-derive this to verify heartbeat HMACs. We never
 * persist the heartbeat secret itself.
 */
export function deriveHeartbeatSecret(bridgeToken: string, bridgeId: string): string {
  return createHmac("sha256", bridgeToken).update(`heartbeat:${bridgeId}`).digest("hex");
}

/** URL-safe opaque random token (default 32 bytes → 43-char base64url). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Opaque random device code (RFC 8628 device_code). */
export function randomDeviceCode(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Short, human-typeable user code (RFC 8628 user_code), e.g. "K4P7-9QR2".
 * Uses a Crockford-ish alphabet that omits easily-confused chars (0/O, 1/I/L).
 */
export function randomUserCode(): string {
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const pick = () => ALPHABET[randomBytes(1)[0] % ALPHABET.length];
  const group = () => Array.from({ length: 4 }, pick).join("");
  return `${group()}-${group()}`;
}

/** Constant-time comparison of two hex strings of equal length. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * Extract a Bearer token from an Authorization header value. Returns null when
 * the header is missing or not a well-formed Bearer credential.
 */
export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}
