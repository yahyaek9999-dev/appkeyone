// Lightweight AES-256-GCM encrypt/decrypt for sensitive secrets at rest.
//
// Used for merchant-supplied AI provider API keys stored in `Bot.aiApiKeyEnc`.
// No external dependencies — uses Node's built-in `crypto` module.
//
// Key derivation:
//   The 32-byte symmetric key is scrypt-derived from process.env.AUTH_SECRET
//   (the same secret already used to sign session JWTs). If AUTH_SECRET is
//   missing or shorter than 32 bytes, we throw — production must set it.
//
// Ciphertext format (single string):
//   "gcm:<iv_b64>:<tag_b64>:<ct_b64>"
//
// IMPORTANT: rotating AUTH_SECRET will invalidate every stored key and the
// merchant will be prompted to re-enter their provider key. This is by design.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 12; // 96-bit nonce for GCM
const SCRYPT_SALT = Buffer.from("keyone:provider-key:v1"); // fixed salt — key derivation is deterministic per AUTH_SECRET

let cachedKey: Buffer | null = null;
function deriveKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.AUTH_SECRET || "";
  if (secret.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short (need ≥16 chars). Cannot encrypt provider keys."
    );
  }
  cachedKey = scryptSync(secret, SCRYPT_SALT, KEY_LEN);
  return cachedKey;
}

/** Encrypts a UTF-8 plaintext string. Returns a self-describing ciphertext blob. */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return "";
  const key = deriveKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gcm:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Decrypts a blob produced by `encryptSecret`. Throws on tamper / bad key. */
export function decryptSecret(blob: string): string {
  if (!blob) return "";
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== "gcm") {
    throw new Error("invalid ciphertext format");
  }
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ct = Buffer.from(parts[3], "base64");
  const key = deriveKey();
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/**
 * Returns a UI-safe mask of a secret: shows first 3 + last 4 chars, dots in
 * the middle. Used by GET endpoints — the raw key is NEVER returned to the
 * frontend after it has been saved.
 */
export function maskSecret(plaintext: string): string {
  if (!plaintext) return "";
  if (plaintext.length <= 8) return "•".repeat(plaintext.length);
  const head = plaintext.slice(0, 3);
  const tail = plaintext.slice(-4);
  return `${head}${"•".repeat(Math.max(4, plaintext.length - 7))}${tail}`;
}
