// Universal Providers — SMS domain service (server-only).
//
// Adapters for Twilio, Vonage, MessageBird, Plivo, Infobip and a generic custom
// gateway (bare fetch, no SDKs). Priority-ordered failover + per-provider ping
// (credential validation). Resolved field mapping is documented per provider.

import { safeFetch } from "@/lib/ssrf";
import { runWithFailover } from "../failover";
import { registerService } from "../services";
import { IntegrationError, isRetryableStatus, type FailoverResult, type ResolvedProvider } from "../types";

export type SmsMessage = { to: string; body: string };
export type SmsResult = { id?: string; status?: string };

const TIMEOUT = 20000;
function timeout() {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT);
  return { signal: c.signal, done: () => clearTimeout(t) };
}
function basic(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}
async function readErr(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j?.message || j?.error_message || j?.["error-text"] || j?.requestError?.serviceException?.text || JSON.stringify(j).slice(0, 200);
  } catch {
    try { return (await res.text()).slice(0, 200); } catch { return res.statusText; }
  }
}
function fromOf(p: ResolvedProvider): string {
  return String(p.config.from || "");
}

// ── Send ─────────────────────────────────────────────────────────────────────
export async function runSmsSend(p: ResolvedProvider, msg: SmsMessage): Promise<SmsResult> {
  const from = fromOf(p);
  const { signal, done } = timeout();
  try {
    if (p.provider === "twilio") {
      // publicId=AccountSID, secret=AuthToken, config.from=number|MGsid
      const sid = p.publicId;
      if (!sid) throw new IntegrationError("sms", "twilio", 0, "account_sid_required", false);
      const form = new URLSearchParams({ To: msg.to, Body: msg.body });
      if (from.startsWith("MG")) form.set("MessagingServiceSid", from);
      else form.set("From", from);
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: "POST", signal,
        headers: { Authorization: basic(sid, p.secret), "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      if (!res.ok) throw new IntegrationError("sms", "twilio", res.status, await readErr(res), isRetryableStatus(res.status));
      const j = await res.json().catch(() => ({}));
      return { id: j.sid, status: j.status };
    }

    if (p.provider === "vonage") {
      // publicId=apiKey, secret=apiSecret
      const form = new URLSearchParams({ api_key: p.publicId, api_secret: p.secret, to: msg.to, from, text: msg.body });
      const res = await fetch("https://rest.nexmo.com/sms/json", {
        method: "POST", signal,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      const j = await res.json().catch(() => ({}));
      const m = j?.messages?.[0];
      if (!res.ok || !m || m.status !== "0") {
        throw new IntegrationError("sms", "vonage", res.status || 400, m?.["error-text"] || (await readErr(res)), false);
      }
      return { id: m["message-id"], status: "sent" };
    }

    if (p.provider === "messagebird") {
      // secret=apiKey
      const res = await fetch("https://rest.messagebird.com/messages", {
        method: "POST", signal,
        headers: { Authorization: `AccessKey ${p.secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: [msg.to], originator: from, body: msg.body }),
      });
      if (!res.ok) throw new IntegrationError("sms", "messagebird", res.status, await readErr(res), isRetryableStatus(res.status));
      const j = await res.json().catch(() => ({}));
      return { id: j.id, status: j?.recipients?.items?.[0]?.status };
    }

    if (p.provider === "plivo") {
      // publicId=AuthID, secret=AuthToken
      const authId = p.publicId;
      if (!authId) throw new IntegrationError("sms", "plivo", 0, "auth_id_required", false);
      const res = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(authId)}/Message/`, {
        method: "POST", signal,
        headers: { Authorization: basic(authId, p.secret), "Content-Type": "application/json" },
        body: JSON.stringify({ src: from, dst: msg.to, text: msg.body }),
      });
      if (!res.ok && res.status !== 202) throw new IntegrationError("sms", "plivo", res.status, await readErr(res), isRetryableStatus(res.status));
      const j = await res.json().catch(() => ({}));
      return { id: j?.message_uuid?.[0], status: "queued" };
    }

    if (p.provider === "infobip") {
      // endpoint=baseUrl (merchant-configurable), secret=apiKey — safeFetch
      // re-validates the resolved address at send time, not just at the
      // config-save-time check, closing a DNS-rebinding TOCTOU window (the
      // same reason the "custom" provider two branches below already uses it).
      const base = p.endpoint.replace(/\/+$/, "");
      const res = await safeFetch(`${base}/sms/2/text/advanced`, {
        method: "POST", signal,
        headers: { Authorization: `App ${p.secret}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ messages: [{ from, destinations: [{ to: msg.to }], text: msg.body }] }),
      } as any);
      if (!res.ok) throw new IntegrationError("sms", "infobip", res.status, await readErr(res), isRetryableStatus(res.status));
      const j = await res.json().catch(() => ({}));
      const m = j?.messages?.[0];
      return { id: m?.messageId, status: m?.status?.name };
    }

    if (p.provider === "custom") {
      // endpoint, secret=apiKey, config.from — SSRF-validated POST {to,from,text,body}
      if (!p.endpoint) throw new IntegrationError("sms", "custom", 0, "endpoint_required", false);
      const res = await safeFetch(p.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(p.secret ? { Authorization: `Bearer ${p.secret}` } : {}) },
        body: JSON.stringify({ to: msg.to, from, text: msg.body, body: msg.body }),
      } as any);
      if (!res.ok) throw new IntegrationError("sms", "custom", res.status, await readErr(res), isRetryableStatus(res.status));
      const j = await res.json().catch(() => ({}));
      return { id: j?.id || j?.messageId, status: j?.status || "sent" };
    }

    throw new IntegrationError("sms", p.provider, 0, "unsupported_sms_provider", false);
  } catch (e: any) {
    if (e instanceof IntegrationError) throw e;
    if (String(e?.message || "").includes("blocked_url")) throw new IntegrationError("sms", p.provider, 0, "endpoint blocked (internal/unsafe URL)", false);
    throw new IntegrationError("sms", p.provider, 0, String(e?.message || "sms_failed"), true);
  } finally {
    done();
  }
}

// ── Ping (credential validation, no send) ────────────────────────────────────
async function pingSms(p: ResolvedProvider): Promise<void> {
  const { signal, done } = timeout();
  try {
    let res: Response;
    if (p.provider === "twilio") {
      res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(p.publicId)}.json`, { headers: { Authorization: basic(p.publicId, p.secret) }, signal });
    } else if (p.provider === "vonage") {
      res = await fetch(`https://rest.nexmo.com/account/get-balance?api_key=${encodeURIComponent(p.publicId)}&api_secret=${encodeURIComponent(p.secret)}`, { headers: { Accept: "application/json" }, signal });
    } else if (p.provider === "messagebird") {
      res = await fetch("https://rest.messagebird.com/balance", { headers: { Authorization: `AccessKey ${p.secret}` }, signal });
    } else if (p.provider === "plivo") {
      res = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(p.publicId)}/`, { headers: { Authorization: basic(p.publicId, p.secret) }, signal });
    } else if (p.provider === "infobip") {
      res = await safeFetch(`${p.endpoint.replace(/\/+$/, "")}/account/1/balance`, { headers: { Authorization: `App ${p.secret}`, Accept: "application/json" }, signal } as any);
    } else if (p.provider === "custom") {
      // Cannot validate generic gateway creds without sending; verify the
      // endpoint is a public, resolvable https URL (SSRF guard).
      const { assertPublicHttpUrl } = await import("@/lib/ssrf");
      await assertPublicHttpUrl(p.endpoint);
      done();
      return;
    } else {
      throw new IntegrationError("sms", p.provider, 0, "unsupported_sms_provider", false);
    }
    if (!res.ok) throw new IntegrationError("sms", p.provider, res.status, await readErr(res), false);
  } catch (e: any) {
    if (e instanceof IntegrationError) throw e;
    if (String(e?.message || "").includes("blocked_url")) throw new IntegrationError("sms", p.provider, 0, "endpoint blocked (internal/unsafe URL)", false);
    throw new IntegrationError("sms", p.provider, 0, String(e?.message || "ping_failed"), false);
  } finally {
    done();
  }
}

/** Send an SMS across the tenant's configured providers with failover. */
export async function sendSmsWithFailover(userId: string, msg: SmsMessage): Promise<FailoverResult<SmsResult>> {
  return runWithFailover(userId, "sms", (p) => runSmsSend(p, msg), { operation: "send" });
}

registerService({ domain: "sms", ping: pingSms });
