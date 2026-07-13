// Platform-level transactional email (password reset, future account
// notices). Distinct from lib/integrations/email/* — that module sends on
// behalf of a *tenant's own business* to their customers using per-tenant
// vault credentials. This module sends KEYONE's own system email (e.g. "here
// is your password reset link") and has no tenant context.
//
// No platform email provider is configured today (verified: no SMTP/SES/etc.
// credentials exist locally or in the production .env as of 2026-07-13).
// This throws PlatformEmailNotConfiguredError rather than pretending to
// succeed — callers must catch it and degrade gracefully (log, don't leak to
// the client) instead of assuming the email actually sent. Wire real SES
// credentials via PLATFORM_SES_ACCESS_KEY_ID / PLATFORM_SES_SECRET_ACCESS_KEY
// / PLATFORM_SES_REGION / PLATFORM_EMAIL_FROM to activate delivery — no other
// code change needed once those are set.

import { createHash, createHmac } from "crypto";

export class PlatformEmailNotConfiguredError extends Error {
  constructor() {
    super("platform_email_not_configured");
    this.name = "PlatformEmailNotConfiguredError";
  }
}

function sha256hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}
function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}
function stamps(): { amzDate: string; dateStamp: string } {
  const iso = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function sign(
  region: string,
  host: string,
  path: string,
  body: string,
  accessKey: string,
  secretKey: string,
): Record<string, string> {
  const { amzDate, dateStamp } = stamps();
  const payloadHash = sha256hex(body);
  const baseHeaders: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    "content-type": "application/json",
  };
  const sortedKeys = Object.keys(baseHeaders).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${baseHeaders[k]}\n`).join("");
  const signedHeaders = sortedKeys.join(";");
  const canonicalRequest = ["POST", path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${region}/ses/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  const kDate = hmac("AWS4" + secretKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "ses");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return {
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    "Content-Type": "application/json",
    Authorization: authorization,
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export interface PlatformEmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** True once real credentials are present — check before doing reset-flow work that assumes delivery. */
export function isPlatformEmailConfigured(): boolean {
  return Boolean(
    process.env.PLATFORM_SES_ACCESS_KEY_ID &&
      process.env.PLATFORM_SES_SECRET_ACCESS_KEY &&
      process.env.PLATFORM_EMAIL_FROM,
  );
}

export async function sendPlatformEmail(msg: PlatformEmailMessage): Promise<{ messageId?: string }> {
  const accessKey = process.env.PLATFORM_SES_ACCESS_KEY_ID;
  const secretKey = process.env.PLATFORM_SES_SECRET_ACCESS_KEY;
  const fromEmail = process.env.PLATFORM_EMAIL_FROM;
  const region = process.env.PLATFORM_SES_REGION || "us-east-1";
  if (!accessKey || !secretKey || !fromEmail) {
    throw new PlatformEmailNotConfiguredError();
  }
  const fromName = process.env.PLATFORM_EMAIL_FROM_NAME || "KEYONE";
  const host = `email.${region}.amazonaws.com`;
  const path = "/v2/email/outbound-emails";
  const body = JSON.stringify({
    FromEmailAddress: `${fromName} <${fromEmail}>`,
    Destination: { ToAddresses: [msg.to] },
    Content: {
      Simple: {
        Subject: { Data: msg.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: msg.html, Charset: "UTF-8" },
          Text: { Data: msg.text || stripHtml(msg.html), Charset: "UTF-8" },
        },
      },
    },
  });
  const headers = sign(region, host, path, body, accessKey, secretKey);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`https://${host}${path}`, { method: "POST", headers, body, signal: ctrl.signal });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`ses_send_failed status=${res.status} ${detail.slice(0, 200)}`);
    }
    const j = await res.json().catch(() => ({}));
    return { messageId: j.MessageId };
  } finally {
    clearTimeout(t);
  }
}
