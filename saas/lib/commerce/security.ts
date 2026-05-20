import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { decryptSecret, encryptSecret } from "@/lib/crypto-util";
import { prisma } from "@/lib/db";
import type {
  CommerceIntegrationSummary,
  WebhookVerificationResult,
} from "./types";

const API_KEY_PREFIX = "ko_live_";
const KEY_BYTES = 32;
const SECRET_BYTES = 32;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = API_KEY_PREFIX + randomBytes(KEY_BYTES).toString("base64url");
  return { raw, hash: sha256(raw), prefix: raw.slice(0, 16) };
}

export function createWebhookSecret(): { raw: string; encrypted: string } {
  const raw = "whsec_" + randomBytes(SECRET_BYTES).toString("base64url");
  return { raw, encrypted: encryptSecret(raw) };
}

export function maskApiKey(prefix: string): string {
  if (!prefix) return "";
  return `${prefix}${"•".repeat(18)}`;
}

export function hmacHex(secret: string, rawPayload: string): string {
  return createHmac("sha256", secret).update(rawPayload).digest("hex");
}

export function hmacBase64(secret: string, rawPayload: string): string {
  return createHmac("sha256", secret).update(rawPayload).digest("base64");
}

function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifySignature(
  secret: string,
  rawPayload: string,
  provided: string | null,
): boolean {
  if (!secret || !provided) return false;
  const normalized = provided.startsWith("sha256=")
    ? provided.slice(7)
    : provided;
  const expected = hmacHex(secret, rawPayload);
  return safeCompare(expected, normalized);
}

export function verifySignatureAny(
  secret: string,
  rawPayload: string,
  provided: string | null,
): boolean {
  if (!secret || !provided) return false;
  const normalized = provided.startsWith("sha256=")
    ? provided.slice(7)
    : provided;
  return (
    safeCompare(hmacHex(secret, rawPayload), normalized) ||
    safeCompare(hmacBase64(secret, rawPayload), normalized)
  );
}

export function verifyWebhookTimestamp(
  value: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (!value) return false;
  const asNumber = Number(value);
  const ts = Number.isFinite(asNumber) ? asNumber : Date.parse(value);
  if (!Number.isFinite(ts)) return false;
  const normalized = ts < 10_000_000_000 ? ts * 1000 : ts;
  return Math.abs(nowMs - normalized) <= MAX_CLOCK_SKEW_MS;
}

export async function resolveIntegrationFromRequest(
  req: Request,
  rawPayload: string,
): Promise<WebhookVerificationResult> {
  const apiKey =
    req.headers.get("x-keyone-api-key") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  let integration: any = null;
  let secret = "";
  let nativeMode = false;

  if (apiKey.trim()) {
    integration = await (prisma as any).commerceIntegration.findUnique({
      where: { apiKeyHash: sha256(apiKey.trim()) },
      select: {
        id: true,
        userId: true,
        name: true,
        platform: true,
        enabled: true,
        apiKeyPrefix: true,
        webhookSecretEnc: true,
        nativeWebhookSecretEnc: true,
      },
    });
    if (!integration)
      return { ok: false, reason: "invalid_api_key", signatureOk: false };
  } else {
    const url = new URL(req.url);
    const integrationId =
      url.searchParams.get("integrationId") ||
      req.headers.get("x-keyone-integration-id") ||
      "";
    if (!integrationId)
      return { ok: false, reason: "missing_api_key", signatureOk: false };
    nativeMode = true;
    integration = await (prisma as any).commerceIntegration.findUnique({
      where: { id: integrationId },
      select: {
        id: true,
        userId: true,
        name: true,
        platform: true,
        enabled: true,
        apiKeyPrefix: true,
        webhookSecretEnc: true,
        nativeWebhookSecretEnc: true,
      },
    });
    if (!integration)
      return { ok: false, reason: "invalid_integration", signatureOk: false };
  }

  if (!integration.enabled)
    return { ok: false, reason: "integration_disabled", signatureOk: false };

  try {
    secret = decryptSecret(
      (nativeMode ? integration.nativeWebhookSecretEnc : null) ||
        integration.webhookSecretEnc ||
        "",
    );
  } catch {
    return { ok: false, reason: "secret_unreadable", signatureOk: false };
  }

  let signatureOk = false;
  if (nativeMode) {
    const nativeSignature =
      req.headers.get("x-wc-webhook-signature") ||
      req.headers.get("x-shopify-hmac-sha256") ||
      req.headers.get("x-salla-signature") ||
      req.headers.get("x-zid-signature") ||
      req.headers.get("x-keyone-signature");
    signatureOk = verifySignatureAny(secret, rawPayload, nativeSignature);
  } else {
    if (!verifyWebhookTimestamp(req.headers.get("x-keyone-timestamp"))) {
      return { ok: false, reason: "bad_timestamp", signatureOk: false };
    }
    signatureOk = verifySignature(
      secret,
      rawPayload,
      req.headers.get("x-keyone-signature"),
    );
  }
  if (!signatureOk) return { ok: false, reason: "bad_signature", signatureOk };

  const summary: CommerceIntegrationSummary = {
    id: integration.id,
    userId: integration.userId,
    name: integration.name,
    platform: integration.platform,
    enabled: integration.enabled,
    apiKeyPrefix: integration.apiKeyPrefix,
    webhookSecret: secret,
  };

  return { ok: true, signatureOk, integration: summary };
}
