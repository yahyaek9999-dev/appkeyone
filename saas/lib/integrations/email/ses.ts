// Universal Providers — Amazon SES v2 email adapter (server-only).
//
// Uses the SESv2 HTTP API with AWS Signature V4 (no AWS SDK). Resolved mapping:
// publicId=accessKeyId, secret=secretAccessKey, config.region, config.fromEmail,
// config.fromName.

import { createHash, createHmac } from "crypto";
import { IntegrationError, isRetryableStatus, type ResolvedProvider } from "../types";
import type { EmailMessage } from "./index";

const SERVICE = "ses";

function sha256hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}
function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}
function stamps(): { amzDate: string; dateStamp: string } {
  const iso = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

/** Build the SigV4 Authorization header + the headers to send. */
function sign(
  method: "GET" | "POST",
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
  };
  if (method === "POST") baseHeaders["content-type"] = "application/json";

  const sortedKeys = Object.keys(baseHeaders).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${baseHeaders[k]}\n`).join("");
  const signedHeaders = sortedKeys.join(";");

  const canonicalRequest = [method, path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");

  const kDate = hmac("AWS4" + secretKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const out: Record<string, string> = {
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    Authorization: authorization,
  };
  if (method === "POST") out["Content-Type"] = "application/json";
  return out;
}

function ctx(p: ResolvedProvider) {
  const region = String(p.config.region || "us-east-1");
  return {
    region,
    host: `email.${region}.amazonaws.com`,
    accessKey: p.publicId,
    secretKey: p.secret,
    fromEmail: String(p.config.fromEmail || ""),
    fromName: String(p.config.fromName || "KEYONE"),
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function readErr(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j?.message || j?.Message || JSON.stringify(j).slice(0, 200);
  } catch {
    try { return (await res.text()).slice(0, 200); } catch { return res.statusText; }
  }
}

export async function sendSes(p: ResolvedProvider, msg: EmailMessage): Promise<{ messageId?: string }> {
  const c = ctx(p);
  if (!c.accessKey || !c.secretKey) throw new IntegrationError("email", "ses", 0, "ses_credentials_required", false);
  if (!c.fromEmail) throw new IntegrationError("email", "ses", 0, "from_email_required", false);
  const path = "/v2/email/outbound-emails";
  const body = JSON.stringify({
    FromEmailAddress: c.fromName ? `${c.fromName} <${c.fromEmail}>` : c.fromEmail,
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
  const headers = sign("POST", c.region, c.host, path, body, c.accessKey, c.secretKey);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`https://${c.host}${path}`, { method: "POST", headers, body, signal: ctrl.signal });
    if (!res.ok) throw new IntegrationError("email", "ses", res.status, await readErr(res), isRetryableStatus(res.status));
    const j = await res.json().catch(() => ({}));
    return { messageId: j.MessageId };
  } catch (e: any) {
    if (e instanceof IntegrationError) throw e;
    throw new IntegrationError("email", "ses", 0, String(e?.message || "ses_failed"), true);
  } finally {
    clearTimeout(t);
  }
}

/** Validate SES credentials via GetAccount (no send). */
export async function pingSes(p: ResolvedProvider): Promise<void> {
  const c = ctx(p);
  if (!c.accessKey || !c.secretKey) throw new IntegrationError("email", "ses", 0, "ses_credentials_required", false);
  const path = "/v2/email/account";
  const headers = sign("GET", c.region, c.host, path, "", c.accessKey, c.secretKey);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`https://${c.host}${path}`, { method: "GET", headers, signal: ctrl.signal });
    if (!res.ok) throw new IntegrationError("email", "ses", res.status, await readErr(res), false);
  } catch (e: any) {
    if (e instanceof IntegrationError) throw e;
    throw new IntegrationError("email", "ses", 0, String(e?.message || "ses_failed"), false);
  } finally {
    clearTimeout(t);
  }
}
