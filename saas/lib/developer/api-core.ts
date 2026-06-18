/**
 * lib/developer/api-core.ts — PURE API-key primitives (no DB).
 *
 * Keys are shown ONCE in plaintext at creation; only the SHA-256 hash is stored.
 * Verification is deterministic (lookup by hash) and constant-time.
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";

const PREFIX = "ko_live_";

/** Generate a fresh plaintext secret, e.g. "ko_live_<48 hex>". */
export function generateApiKeySecret(): string {
  return PREFIX + randomBytes(24).toString("hex");
}

/** SHA-256 hex of a plaintext secret — what we store/look up by. */
export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Non-secret display prefix, e.g. "ko_live_a1b2c3…" (safe to store/show). */
export function keyDisplayPrefix(secret: string): string {
  const head = secret.slice(0, PREFIX.length + 6);
  return `${head}…`;
}

/** Constant-time hex-string comparison. */
export function hashesEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/** Extract a token from an Authorization header ("Bearer xxx") or x-api-key. */
export function parseApiKeyHeader(headers: Headers): string | null {
  const auth = headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim() || null;
  const x = headers.get("x-api-key");
  return x ? x.trim() : null;
}

export function parseScopes(raw: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

/** Scope check. "*" or "<resource>:*" or exact match grants. read implies *:read. */
export function hasScope(scopes: string[], required: string): boolean {
  if (!required) return true;
  if (scopes.includes("*") || scopes.includes(required)) return true;
  const [res, action] = required.split(":");
  if (action && scopes.includes(`${res}:*`)) return true;
  if (action === "read" && scopes.includes("read")) return true;
  if (action === "write" && scopes.includes("write")) return true;
  return false;
}

export function isExpired(expiresAt: Date | null | undefined): boolean {
  return !!expiresAt && new Date(expiresAt).getTime() < Date.now();
}
