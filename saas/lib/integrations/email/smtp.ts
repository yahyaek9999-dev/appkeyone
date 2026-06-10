// Universal Providers — SMTP email adapter (server-only).
//
// Self-contained SMTP client (AUTH LOGIN + STARTTLS / implicit TLS) so the
// universal layer stays isolated from lib/commerce/email.ts (left untouched).
// Resolved mapping: endpoint=host, config.port, publicId=username,
// secret=password, config.fromEmail, config.fromName.

import net from "net";
import tls from "tls";
import { lookup } from "dns";
import { promisify } from "util";
import { isPrivateIp } from "@/lib/ssrf";
import { IntegrationError, type ResolvedProvider } from "../types";
import type { EmailMessage } from "./index";

const dnsLookup = promisify(lookup);

/**
 * SSRF guard: the SMTP host comes from a tenant-configured provider row, so
 * reject loopback / private / link-local / metadata destinations before opening
 * any socket — otherwise this adapter (and its /test endpoint) is an internal
 * port-scan + banner oracle. Mirrors the guard on the legacy commerce SMTP path.
 */
async function assertSmtpHostPublic(host: string): Promise<void> {
  const lower = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!lower) throw new Error("smtp_host_required");
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower === "metadata.google.internal"
  ) {
    throw new Error("blocked_smtp_host");
  }
  if (net.isIP(lower)) {
    if (isPrivateIp(lower)) throw new Error("blocked_smtp_host");
    return;
  }
  let records: { address: string }[];
  try {
    records = await dnsLookup(lower, { all: true });
  } catch {
    throw new Error("blocked_smtp_host");
  }
  if (!records.length) throw new Error("blocked_smtp_host");
  for (const rec of records) {
    if (isPrivateIp(rec.address)) throw new Error("blocked_smtp_host");
  }
}

function b64(v: string): string {
  return Buffer.from(v, "utf8").toString("base64");
}
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function buildMime(msg: EmailMessage, from: string, fromName: string): string {
  const boundary = "keyone_" + Buffer.from(String(msg.subject)).toString("hex").slice(0, 12);
  const text = msg.text || stripHtml(msg.html);
  return [
    `From: ${fromName ? `"${fromName.replace(/"/g, "")}" ` : ""}<${from}>`,
    `To: <${msg.to}>`,
    `Subject: =?UTF-8?B?${b64(msg.subject)}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(text),
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(msg.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function readReply(socket: net.Socket | tls.TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("smtp_timeout")), 15000);
    socket.once("data", (chunk) => {
      clearTimeout(timer);
      resolve(chunk.toString("utf8"));
    });
    socket.once("error", reject);
  });
}

async function cmd(socket: net.Socket | tls.TLSSocket, command: string, expected: number[]): Promise<string> {
  socket.write(command + "\r\n");
  const reply = await readReply(socket);
  const code = Number(reply.slice(0, 3));
  if (!expected.includes(code)) throw new Error(reply.trim().slice(0, 200));
  return reply;
}

async function connect(host: string, port: number): Promise<net.Socket | tls.TLSSocket> {
  if (!host) throw new Error("smtp_host_required");
  await assertSmtpHostPublic(host); // SSRF guard before any socket opens
  if (port === 465) {
    const s = tls.connect({ host, port, servername: host });
    await readReply(s);
    return s;
  }
  const s = net.connect({ host, port });
  await readReply(s);
  await cmd(s, "EHLO keyone.local", [250]);
  await cmd(s, "STARTTLS", [220]);
  const secure = tls.connect({ socket: s, servername: host });
  await cmd(secure, "EHLO keyone.local", [250]);
  return secure;
}

function cfg(p: ResolvedProvider) {
  return {
    host: p.endpoint,
    port: Number(p.config.port || 587),
    username: p.publicId || String(p.config.fromEmail || ""),
    password: p.secret,
    fromEmail: String(p.config.fromEmail || ""),
    fromName: String(p.config.fromName || "KEYONE"),
  };
}

export async function sendSmtp(p: ResolvedProvider, msg: EmailMessage): Promise<{ messageId?: string }> {
  const c = cfg(p);
  if (!c.fromEmail) throw new IntegrationError("email", "smtp", 0, "from_email_required", false);
  let socket: net.Socket | tls.TLSSocket | null = null;
  try {
    socket = await connect(c.host, c.port);
    if (c.password) {
      await cmd(socket, "AUTH LOGIN", [334]);
      await cmd(socket, b64(c.username), [334]);
      await cmd(socket, b64(c.password), [235]);
    }
    await cmd(socket, `MAIL FROM:<${c.fromEmail}>`, [250]);
    await cmd(socket, `RCPT TO:<${msg.to}>`, [250, 251]);
    await cmd(socket, "DATA", [354]);
    socket.write(buildMime(msg, c.fromEmail, c.fromName) + "\r\n.\r\n");
    await readReply(socket);
    await cmd(socket, "QUIT", [221]).catch(() => "");
    return {};
  } catch (e: any) {
    throw new IntegrationError("email", "smtp", 0, String(e?.message || "smtp_failed"), true);
  } finally {
    socket?.destroy();
  }
}

/** Verify SMTP credentials without sending: connect + AUTH LOGIN + QUIT. */
export async function pingSmtp(p: ResolvedProvider): Promise<void> {
  const c = cfg(p);
  let socket: net.Socket | tls.TLSSocket | null = null;
  try {
    socket = await connect(c.host, c.port);
    if (c.password) {
      await cmd(socket, "AUTH LOGIN", [334]);
      await cmd(socket, b64(c.username), [334]);
      await cmd(socket, b64(c.password), [235]);
    }
    await cmd(socket, "QUIT", [221]).catch(() => "");
  } catch (e: any) {
    throw new IntegrationError("email", "smtp", 0, String(e?.message || "smtp_auth_failed"), false);
  } finally {
    socket?.destroy();
  }
}
