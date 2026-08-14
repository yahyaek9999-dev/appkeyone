// K1SMS — core send function + credit accounting
// This is the single path through which all SMS messages flow.
// Never bypass this function to send SMS directly.

import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto-util";
import { getAdapter } from "./adapters";
import type { SmsPurpose } from "./types";

export interface SmsSendInput {
  userId: string;
  to: string;         // E.164 phone number
  body: string;
  purpose?: SmsPurpose;
  templateId?: string;
  customerId?: string;
  orderId?: string;
}

export interface SmsSendResult {
  ok: boolean;
  messageId?: string;
  detail: string;
}

/** Resolve the active SMS provider for a tenant.
 *  Preference order: tenant-specific default → platform-wide default. */
async function resolveProvider(userId: string) {
  const p = await (prisma as any).smsProvider.findFirst({
    where: {
      OR: [{ userId, isDefault: true }, { userId, enabled: true }],
      enabled: true,
    },
    orderBy: [{ userId: "desc" }, { isDefault: "desc" }],
  });
  if (p) return p;
  // Platform-wide fallback
  return (prisma as any).smsProvider.findFirst({
    where: { userId: null, enabled: true },
    orderBy: { isDefault: "desc" },
  });
}

function decryptProviderCreds(p: any) {
  const dec = (v: string | null | undefined) => {
    if (!v) return null;
    try { return decryptSecret(v); } catch { return null; }
  };
  return {
    apiKey: dec(p.apiKeyEnc),
    apiSecret: dec(p.apiSecretEnc),
    senderId: dec(p.senderIdEnc),
    endpoint: p.endpoint ?? null,
  };
}

/** Get or initialise the SMS credit balance for a tenant.
 *  Returns balance in fils×100 units. */
export async function getSmsBalance(userId: string): Promise<number> {
  const rows = await (prisma as any).smsCreditLedger.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return rows._sum.amount ?? 0;
}

/** Debit SMS credits for a tenant. Creates a ledger entry. */
export async function debitSmsCredits(
  userId: string,
  amount: number,
  ref?: string,
  note?: string,
): Promise<void> {
  const balance = await getSmsBalance(userId);
  await (prisma as any).smsCreditLedger.create({
    data: {
      userId,
      type: "debit",
      amount: -Math.abs(amount),
      balanceAfter: balance - Math.abs(amount),
      ref: ref ?? null,
      note: note ?? null,
    },
  });
}

/** Credit SMS credits for a tenant (topup or refund). */
export async function creditSmsCredits(
  userId: string,
  amount: number,
  type: "topup" | "refund" | "adjustment",
  ref?: string,
  note?: string,
  createdBy?: string,
): Promise<void> {
  const balance = await getSmsBalance(userId);
  await (prisma as any).smsCreditLedger.create({
    data: {
      userId,
      type,
      amount: Math.abs(amount),
      balanceAfter: balance + Math.abs(amount),
      ref: ref ?? null,
      note: note ?? null,
      createdBy: createdBy ?? null,
    },
  });
}

/** Send an SMS message through the active provider.
 *  Creates a SmsMessage record regardless of outcome. */
export async function sendSms(input: SmsSendInput): Promise<SmsSendResult> {
  const provider = await resolveProvider(input.userId);

  // Create a pending record first so we have an audit trail even if send fails.
  const msg = await (prisma as any).smsMessage.create({
    data: {
      userId: input.userId,
      providerId: provider?.id ?? null,
      customerId: input.customerId ?? null,
      orderId: input.orderId ?? null,
      templateId: input.templateId ?? null,
      to: input.to,
      body: input.body,
      purpose: input.purpose ?? "custom",
      status: "queued",
      segments: Math.ceil(input.body.length / 160),
    },
  });

  if (!provider) {
    await (prisma as any).smsMessage.update({
      where: { id: msg.id },
      data: { status: "failed", failReason: "لا يوجد مزوّد SMS نشط" },
    });
    return { ok: false, messageId: msg.id, detail: "لا يوجد مزوّد SMS نشط" };
  }

  const creds = decryptProviderCreds(provider);
  const adapter = getAdapter(provider.type);

  const result = await adapter.send({ to: input.to, body: input.body, senderId: creds.senderId ?? undefined }, creds);

  await (prisma as any).smsMessage.update({
    where: { id: msg.id },
    data: {
      status: result.ok ? "sent" : "failed",
      providerMsgId: result.providerMsgId ?? null,
      costUnits: result.costUnits ?? 0,
      segments: result.segments ?? msg.segments,
      failReason: result.ok ? null : result.detail,
      sentAt: result.ok ? new Date() : null,
    },
  });

  if (result.ok && result.costUnits) {
    await debitSmsCredits(input.userId, result.costUnits, msg.id, `SMS: ${input.purpose}`).catch(() => {});
  }

  // Increment template send count
  if (input.templateId) {
    await (prisma as any).smsTemplate
      .update({ where: { id: input.templateId }, data: { sendCount: { increment: 1 } } })
      .catch(() => {});
  }

  return { ok: result.ok, messageId: msg.id, detail: result.detail };
}

/** Render a template body — replaces {{variable}} with values. */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

/** Send an SMS using a saved template, with variable substitution. */
export async function sendSmsFromTemplate(
  userId: string,
  templateId: string,
  to: string,
  vars: Record<string, string>,
  opts?: { customerId?: string; orderId?: string },
): Promise<SmsSendResult> {
  const tpl = await (prisma as any).smsTemplate.findFirst({
    where: { id: templateId, userId, enabled: true },
  });
  if (!tpl) return { ok: false, detail: "القالب غير موجود أو معطّل" };
  const body = renderTemplate(tpl.body, vars);
  return sendSms({
    userId,
    to,
    body,
    purpose: tpl.purpose as SmsPurpose,
    templateId,
    customerId: opts?.customerId,
    orderId: opts?.orderId,
  });
}
