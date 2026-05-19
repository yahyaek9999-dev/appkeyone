import net from "net";
import tls from "tls";
import { decryptSecret } from "@/lib/crypto-util";
import { prisma } from "@/lib/db";

export type CommerceEmailSendArgs = {
  userId: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type CommerceEmailSendResult = {
  ok: boolean;
  provider: string;
  messageId?: string;
  error?: string;
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function encodeBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function emailMessage(args: CommerceEmailSendArgs & { from: string; fromName: string }) {
  const boundary = "keyone_" + Date.now().toString(36);
  const text = args.text || stripHtml(args.html);
  return [
    `From: ${args.fromName ? `\"${args.fromName.replace(/\"/g, "")}\" ` : ""}<${args.from}>`,
    `To: <${args.to}>`,
    `Subject: =?UTF-8?B?${encodeBase64(args.subject)}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary=\"${boundary}\"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodeBase64(text),
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodeBase64(args.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function smtpRead(socket: net.Socket | tls.TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("smtp_timeout")), 15000);
    socket.once("data", (chunk) => {
      clearTimeout(timer);
      resolve(chunk.toString("utf8"));
    });
    socket.once("error", reject);
  });
}

async function smtpCommand(socket: net.Socket | tls.TLSSocket, command: string, expected: number[]) {
  socket.write(command + "\r\n");
  const response = await smtpRead(socket);
  const code = Number(response.slice(0, 3));
  if (!expected.includes(code)) throw new Error(response.trim().slice(0, 300));
  return response;
}

async function connectSmtp(provider: any): Promise<net.Socket | tls.TLSSocket> {
  const host = String(provider.host || "");
  const port = Number(provider.port || 587);
  if (!host) throw new Error("smtp_host_required");
  if (port === 465) {
    const socket = tls.connect({ host, port, servername: host });
    await smtpRead(socket);
    return socket;
  }
  const socket = net.connect({ host, port });
  await smtpRead(socket);
  await smtpCommand(socket, `EHLO keyone.local`, [250]);
  await smtpCommand(socket, "STARTTLS", [220]);
  const secure = tls.connect({ socket, servername: host });
  await smtpCommand(secure, `EHLO keyone.local`, [250]);
  return secure;
}

async function sendSmtp(provider: any, args: CommerceEmailSendArgs, secret: string): Promise<CommerceEmailSendResult> {
  let socket: net.Socket | tls.TLSSocket | null = null;
  try {
    socket = await connectSmtp(provider);
    await smtpCommand(socket, "AUTH LOGIN", [334]);
    await smtpCommand(socket, encodeBase64(provider.username || provider.fromEmail), [334]);
    await smtpCommand(socket, encodeBase64(secret), [235]);
    await smtpCommand(socket, `MAIL FROM:<${provider.fromEmail}>`, [250]);
    await smtpCommand(socket, `RCPT TO:<${args.to}>`, [250, 251]);
    await smtpCommand(socket, "DATA", [354]);
    socket.write(emailMessage({ ...args, from: provider.fromEmail, fromName: provider.fromName || "KEYONE" }) + "\r\n.\r\n");
    await smtpRead(socket);
    await smtpCommand(socket, "QUIT", [221]).catch(() => "");
    return { ok: true, provider: "smtp" };
  } catch (e: any) {
    return { ok: false, provider: "smtp", error: e?.message || "smtp_failed" };
  } finally {
    socket?.destroy();
  }
}

async function sendResend(provider: any, args: CommerceEmailSendArgs, secret: string): Promise<CommerceEmailSendResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `${provider.fromName || "KEYONE"} <${provider.fromEmail}>`, to: [args.to], subject: args.subject, html: args.html }),
  });
  const json = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, provider: "resend", messageId: json.id } : { ok: false, provider: "resend", error: JSON.stringify(json).slice(0, 500) };
}

async function sendBrevo(provider: any, args: CommerceEmailSendArgs, secret: string): Promise<CommerceEmailSendResult> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": secret, "Content-Type": "application/json" },
    body: JSON.stringify({ sender: { name: provider.fromName || "KEYONE", email: provider.fromEmail }, to: [{ email: args.to }], subject: args.subject, htmlContent: args.html }),
  });
  const json = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, provider: "brevo", messageId: json.messageId } : { ok: false, provider: "brevo", error: JSON.stringify(json).slice(0, 500) };
}

export async function sendCommerceEmail(args: CommerceEmailSendArgs): Promise<CommerceEmailSendResult> {
  const provider = await (prisma as any).commerceEmailProvider.findFirst({
    where: { userId: args.userId, enabled: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!provider) return { ok: false, provider: "none", error: "email_provider_not_configured" };
  if (!provider.fromEmail) return { ok: false, provider: provider.provider, error: "from_email_required" };

  let secret = "";
  try {
    secret = decryptSecret(provider.secretEnc || "");
  } catch {
    return { ok: false, provider: provider.provider, error: "email_secret_unreadable" };
  }

  if (provider.provider === "resend") return sendResend(provider, args, secret);
  if (provider.provider === "brevo") return sendBrevo(provider, args, secret);
  return sendSmtp(provider, args, secret);
}
