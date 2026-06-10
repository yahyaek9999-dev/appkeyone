// Universal Providers — Email domain service (server-only).
//
// Sends via the tenant's configured providers (SMTP, SendGrid, Mailgun, SES,
// Postmark, Resend, Brevo) with priority-ordered failover, falling back to the
// legacy CommerceEmailProvider rows so existing email config keeps working.
// Registers a DomainService (ping) so the generic dashboard "Test" works.

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto-util";
import { runWithFailover } from "../failover";
import { registerService } from "../services";
import { getDescriptor } from "../registry";
import { IntegrationError, type FailoverResult, type ResolvedProvider } from "../types";
import { sendSmtp, pingSmtp } from "./smtp";
import { sendSes, pingSes } from "./ses";
import { sendHttp, pingHttp } from "./http";

export type EmailMessage = { to: string; subject: string; html: string; text?: string };

const HTTP_PROVIDERS = new Set(["sendgrid", "mailgun", "postmark", "resend", "brevo"]);

/** Send via a single resolved provider (throws IntegrationError on failure). */
export async function runEmailSend(p: ResolvedProvider, msg: EmailMessage): Promise<{ messageId?: string }> {
  if (p.provider === "smtp") return sendSmtp(p, msg);
  if (p.provider === "ses") return sendSes(p, msg);
  if (HTTP_PROVIDERS.has(p.provider)) return sendHttp(p, msg);
  throw new IntegrationError("email", p.provider, 0, "unsupported_email_provider", false);
}

async function pingEmail(p: ResolvedProvider): Promise<void> {
  if (p.provider === "smtp") return pingSmtp(p);
  if (p.provider === "ses") return pingSes(p);
  if (HTTP_PROVIDERS.has(p.provider)) return pingHttp(p);
  throw new IntegrationError("email", p.provider, 0, "unsupported_email_provider", false);
}

/** Map legacy CommerceEmailProvider rows into resolved providers (failover tail). */
async function legacyEmailProviders(userId: string): Promise<ResolvedProvider[]> {
  const rows = await (prisma as any).commerceEmailProvider
    .findMany({ where: { userId, enabled: true }, orderBy: { updatedAt: "desc" } })
    .catch(() => []);
  const out: ResolvedProvider[] = [];
  for (const r of rows as any[]) {
    const descriptor = getDescriptor("email", r.provider);
    if (!descriptor) continue;
    let secret = "";
    try { secret = decryptSecret(r.secretEnc || ""); } catch { secret = ""; }
    out.push({
      credId: null,
      domain: "email",
      provider: r.provider,
      descriptor,
      priority: 1000, // after vault providers
      source: "legacy",
      status: "unknown",
      lastCheckAt: null,
      secret,
      secret2: "",
      publicId: r.username || "",
      endpoint: r.host || "",
      model: "",
      config: { port: r.port, fromEmail: r.fromEmail, fromName: r.fromName },
    });
  }
  return out;
}

/**
 * Send an email across the tenant's configured providers with failover, then
 * the legacy CommerceEmailProvider rows. Returns a graceful disabled result
 * when nothing is configured / all failed.
 */
export async function sendEmailWithFailover(
  userId: string,
  msg: EmailMessage,
  opts: { includeLegacy?: boolean } = {},
): Promise<FailoverResult<{ messageId?: string }>> {
  const includeLegacy = opts.includeLegacy !== false;
  return runWithFailover(userId, "email", (p) => runEmailSend(p, msg), {
    operation: "send",
    ...(includeLegacy ? { appendLegacy: () => legacyEmailProviders(userId) } : {}),
  });
}

registerService({ domain: "email", ping: pingEmail });
