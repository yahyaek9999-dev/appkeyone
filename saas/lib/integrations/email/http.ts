// Universal Providers — HTTP email adapters (server-only): SendGrid, Mailgun,
// Postmark, Resend, Brevo. Each exposes send + ping (credential validation).

import { IntegrationError, isRetryableStatus, type ResolvedProvider } from "../types";
import type { EmailMessage } from "./index";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function from(p: ResolvedProvider): { email: string; name: string } {
  return { email: String(p.config.fromEmail || ""), name: String(p.config.fromName || "KEYONE") };
}
function mailgunBase(p: ResolvedProvider): string {
  const region = String(p.config.region || "us").toLowerCase();
  return region === "eu" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
}
async function readErr(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j?.message || j?.error || j?.errors?.[0]?.message || JSON.stringify(j).slice(0, 200);
  } catch {
    try { return (await res.text()).slice(0, 200); } catch { return res.statusText; }
  }
}
function fail(provider: string, status: number, detail: string): never {
  throw new IntegrationError("email", provider, status, detail, isRetryableStatus(status));
}

const TIMEOUT = 20000;
function withTimeout(): { signal: AbortSignal; done: () => void } {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

// ── Send ─────────────────────────────────────────────────────────────────────
export async function sendHttp(p: ResolvedProvider, msg: EmailMessage): Promise<{ messageId?: string }> {
  const f = from(p);
  if (!f.email) throw new IntegrationError("email", p.provider, 0, "from_email_required", false);
  const text = msg.text || stripHtml(msg.html);
  const { signal, done } = withTimeout();
  try {
    if (p.provider === "sendgrid") {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST", signal,
        headers: { Authorization: `Bearer ${p.secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: msg.to }] }],
          from: { email: f.email, name: f.name },
          subject: msg.subject,
          content: [{ type: "text/plain", value: text }, { type: "text/html", value: msg.html }],
        }),
      });
      if (!res.ok) fail("sendgrid", res.status, await readErr(res));
      return { messageId: res.headers.get("x-message-id") || undefined };
    }

    if (p.provider === "mailgun") {
      const domain = String(p.config.domain || "");
      if (!domain) throw new IntegrationError("email", "mailgun", 0, "mailgun_domain_required", false);
      const body = new URLSearchParams({
        from: `${f.name} <${f.email}>`, to: msg.to, subject: msg.subject, html: msg.html, text,
      });
      const res = await fetch(`${mailgunBase(p)}/v3/${domain}/messages`, {
        method: "POST", signal,
        headers: { Authorization: `Basic ${Buffer.from(`api:${p.secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) fail("mailgun", res.status, await readErr(res));
      const j = await res.json().catch(() => ({}));
      return { messageId: j.id };
    }

    if (p.provider === "postmark") {
      const res = await fetch("https://api.postmarkapp.com/email", {
        method: "POST", signal,
        headers: { "X-Postmark-Server-Token": p.secret, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ From: f.name ? `${f.name} <${f.email}>` : f.email, To: msg.to, Subject: msg.subject, HtmlBody: msg.html, TextBody: text }),
      });
      if (!res.ok) fail("postmark", res.status, await readErr(res));
      const j = await res.json().catch(() => ({}));
      return { messageId: j.MessageID };
    }

    if (p.provider === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST", signal,
        headers: { Authorization: `Bearer ${p.secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `${f.name} <${f.email}>`, to: [msg.to], subject: msg.subject, html: msg.html, text }),
      });
      if (!res.ok) fail("resend", res.status, await readErr(res));
      const j = await res.json().catch(() => ({}));
      return { messageId: j.id };
    }

    if (p.provider === "brevo") {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST", signal,
        headers: { "api-key": p.secret, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sender: { name: f.name, email: f.email }, to: [{ email: msg.to }], subject: msg.subject, htmlContent: msg.html, textContent: text }),
      });
      if (!res.ok) fail("brevo", res.status, await readErr(res));
      const j = await res.json().catch(() => ({}));
      return { messageId: j.messageId };
    }

    throw new IntegrationError("email", p.provider, 0, "unsupported_email_provider", false);
  } finally {
    done();
  }
}

// ── Ping (credential validation, no send) ────────────────────────────────────
export async function pingHttp(p: ResolvedProvider): Promise<void> {
  const { signal, done } = withTimeout();
  try {
    let res: Response;
    if (p.provider === "sendgrid") {
      res = await fetch("https://api.sendgrid.com/v3/scopes", { headers: { Authorization: `Bearer ${p.secret}` }, signal });
    } else if (p.provider === "mailgun") {
      res = await fetch(`${mailgunBase(p)}/v4/domains`, { headers: { Authorization: `Basic ${Buffer.from(`api:${p.secret}`).toString("base64")}` }, signal });
    } else if (p.provider === "postmark") {
      res = await fetch("https://api.postmarkapp.com/server", { headers: { "X-Postmark-Server-Token": p.secret, Accept: "application/json" }, signal });
    } else if (p.provider === "resend") {
      res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${p.secret}` }, signal });
    } else if (p.provider === "brevo") {
      res = await fetch("https://api.brevo.com/v3/account", { headers: { "api-key": p.secret, Accept: "application/json" }, signal });
    } else {
      throw new IntegrationError("email", p.provider, 0, "unsupported_email_provider", false);
    }
    if (!res.ok) fail(p.provider, res.status, await readErr(res));
  } finally {
    done();
  }
}
