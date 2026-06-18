/**
 * lib/developer/keys.ts — API key lifecycle (create / list / verify / rotate /
 * revoke). All mutations are tenant-scoped (WHERE {id,userId}) so there is no
 * IDOR; the plaintext secret is returned ONLY at creation. Lifecycle events are
 * written to the AuditLog.
 */

import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/log";
import {
  generateApiKeySecret, hashApiKey, keyDisplayPrefix, hashesEqual,
  parseScopes, isExpired,
} from "./api-core";

export interface CreateKeyArgs {
  userId: string;
  name?: string;
  scopes?: string[];
  rateLimitPerMin?: number;
  expiresAt?: Date | null;
  createdBy?: string | null;
  rotatedFrom?: string | null;
}

/** Create a key. Returns the plaintext secret ONCE (never stored). */
export async function createApiKey(args: CreateKeyArgs): Promise<{ plaintext: string; key: any }> {
  const secret = generateApiKeySecret();
  const key = await prisma.apiKey.create({
    data: {
      userId: args.userId,
      name: (args.name || "مفتاح API").slice(0, 80),
      keyHash: hashApiKey(secret),
      keyPrefix: keyDisplayPrefix(secret),
      scopes: JSON.stringify(args.scopes && args.scopes.length ? args.scopes : ["read"]),
      rateLimitPerMin: Math.min(Math.max(args.rateLimitPerMin || 60, 1), 6000),
      expiresAt: args.expiresAt || null,
      createdBy: args.createdBy || null,
      rotatedFrom: args.rotatedFrom || null,
    },
  });
  void audit({ userId: args.userId, action: "apikey.created", actorEmail: args.createdBy, targetType: "api_key", targetId: key.id, metadata: { name: key.name, scopes: args.scopes } });
  return { plaintext: secret, key: redact(key) };
}

export async function listApiKeys(userId: string) {
  const keys = await prisma.apiKey.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return keys.map(redact);
}

export async function getApiKey(userId: string, id: string) {
  const key = await prisma.apiKey.findFirst({ where: { id, userId } });
  return key ? redact(key) : null;
}

/**
 * Verify a plaintext secret. Deterministic lookup by hash + constant-time
 * compare; rejects revoked / expired keys. Returns the key row on success.
 */
export async function verifyApiKey(plaintext: string): Promise<{ ok: boolean; key?: any; reason?: string }> {
  if (!plaintext) return { ok: false, reason: "missing" };
  const hash = hashApiKey(plaintext);
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hash } });
  if (!key) return { ok: false, reason: "not_found" };
  if (!hashesEqual(key.keyHash, hash)) return { ok: false, reason: "mismatch" };
  if (key.status !== "active") return { ok: false, reason: "revoked" };
  if (isExpired(key.expiresAt)) return { ok: false, reason: "expired" };
  return { ok: true, key };
}

export async function rotateApiKey(userId: string, id: string, actorEmail?: string | null): Promise<{ plaintext: string; key: any } | null> {
  const old = await prisma.apiKey.findFirst({ where: { id, userId } });
  if (!old) return null;
  await prisma.apiKey.update({ where: { id: old.id }, data: { status: "revoked", revokedAt: new Date() } });
  const created = await createApiKey({
    userId, name: old.name, scopes: parseScopes(old.scopes), rateLimitPerMin: old.rateLimitPerMin,
    expiresAt: old.expiresAt, createdBy: actorEmail, rotatedFrom: old.id,
  });
  void audit({ userId, action: "apikey.rotated", actorEmail, targetType: "api_key", targetId: old.id, metadata: { newKeyId: created.key.id } });
  return created;
}

export async function revokeApiKey(userId: string, id: string, actorEmail?: string | null): Promise<boolean> {
  const key = await prisma.apiKey.findFirst({ where: { id, userId } });
  if (!key) return false;
  if (key.status !== "revoked") {
    await prisma.apiKey.update({ where: { id: key.id }, data: { status: "revoked", revokedAt: new Date() } });
    void audit({ userId, action: "apikey.revoked", actorEmail, targetType: "api_key", targetId: key.id });
  }
  return true;
}

export async function updateApiKey(userId: string, id: string, patch: { name?: string; scopes?: string[]; rateLimitPerMin?: number }, actorEmail?: string | null) {
  const key = await prisma.apiKey.findFirst({ where: { id, userId } });
  if (!key) return null;
  const data: any = {};
  if (patch.name !== undefined) data.name = String(patch.name).slice(0, 80);
  if (patch.scopes !== undefined) data.scopes = JSON.stringify(patch.scopes);
  if (patch.rateLimitPerMin !== undefined) data.rateLimitPerMin = Math.min(Math.max(patch.rateLimitPerMin, 1), 6000);
  const updated = await prisma.apiKey.update({ where: { id: key.id }, data });
  void audit({ userId, action: "apikey.updated", actorEmail, targetType: "api_key", targetId: key.id, metadata: patch });
  return redact(updated);
}

/** Strip the hash before returning a key to any caller. */
function redact(key: any) {
  const { keyHash, ...safe } = key;
  return { ...safe, scopesList: parseScopes(key.scopes) };
}
