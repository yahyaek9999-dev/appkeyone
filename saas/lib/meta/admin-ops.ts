/**
 * Meta Enterprise — privileged config + phone operations.
 *
 * Credential rotation reuses the EXISTING encrypted storage on `Bot`
 * (metaAccessTokenEnc / metaWebhookVerifyToken) via lib/crypto-util — no
 * parallel secret store. Phone registry lives in `MetaPhone`. Every action is
 * audited in `MetaAudit`. None of this touches the WhatsApp send pipeline.
 */

import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto-util";
import { auditMeta, patchMetaHealth, type MetaActorRole } from "./tenant";

type ActorOpts = { actorId?: string | null; actorRole?: MetaActorRole; note?: string | null };

/** Rotate the tenant's Meta Cloud access token (encrypted on Bot). Forces
 *  re-verification (the new token is unverified until the next health check). */
export async function rotateMetaToken(userId: string, newTokenPlain: string, opts: ActorOpts = {}) {
  if (!newTokenPlain || newTokenPlain.trim().length < 10)
    return { ok: false as const, reason: "invalid_token" };
  const bot = await prisma.bot.findUnique({ where: { userId }, select: { id: true } });
  if (!bot) return { ok: false as const, reason: "no_bot" };
  await prisma.bot.update({
    where: { userId },
    data: { metaAccessTokenEnc: encryptSecret(newTokenPlain.trim()) } as any,
  });
  await patchMetaHealth(userId, {
    verificationStatus: "unverified",
    connectionStatus: "connecting",
  });
  await auditMeta({
    userId,
    actorId: opts.actorId,
    actorRole: opts.actorRole ?? "admin",
    action: "rotate_token",
    note: opts.note ?? null,
  });
  return { ok: true as const };
}

/** Reset (or set) the webhook verify token. Generates a strong random token
 *  when none is supplied. Returns it so the operator can paste it into Meta. */
export async function resetMetaWebhook(
  userId: string,
  newVerifyToken: string | undefined,
  opts: ActorOpts = {},
) {
  const token =
    newVerifyToken && newVerifyToken.trim().length >= 8
      ? newVerifyToken.trim()
      : randomBytes(24).toString("hex");
  const bot = await prisma.bot.findUnique({ where: { userId }, select: { id: true } });
  if (!bot) return { ok: false as const, reason: "no_bot" };
  await prisma.bot.update({ where: { userId }, data: { metaWebhookVerifyToken: token } as any });
  await auditMeta({
    userId,
    actorId: opts.actorId,
    actorRole: opts.actorRole ?? "admin",
    action: "reset_webhook",
  });
  return { ok: true as const, verifyToken: token };
}

export interface UpsertPhoneInput {
  phoneNumberId: string;
  wabaId?: string | null;
  displayPhone?: string | null;
  verifiedName?: string | null;
  isPrimary?: boolean;
  accessTokenPlain?: string | null;
  status?: string;
}

/** Register or update a Meta phone for a tenant (enterprise multi-number). */
export async function upsertMetaPhone(
  userId: string,
  input: UpsertPhoneInput,
  opts: ActorOpts = {},
) {
  if (!input.phoneNumberId) return { ok: false as const, reason: "missing_phone_id" };
  const data = {
    wabaId: input.wabaId ?? null,
    displayPhone: input.displayPhone ?? null,
    verifiedName: input.verifiedName ?? null,
    isPrimary: input.isPrimary ?? false,
    status: input.status ?? "pending",
    deletedAt: null,
    ...(input.accessTokenPlain ? { accessTokenEnc: encryptSecret(input.accessTokenPlain) } : {}),
  };
  const phone = await prisma.metaPhone.upsert({
    where: { userId_phoneNumberId: { userId, phoneNumberId: input.phoneNumberId } },
    create: { userId, phoneNumberId: input.phoneNumberId, ...data },
    update: data,
  });
  if (input.isPrimary) {
    await prisma.metaPhone.updateMany({
      where: { userId, NOT: { id: phone.id } },
      data: { isPrimary: false },
    });
  }
  await auditMeta({
    userId,
    actorId: opts.actorId,
    actorRole: opts.actorRole ?? "admin",
    action: "add_phone",
    target: input.phoneNumberId,
  });
  return { ok: true as const, phone };
}

/** Transfer a phone (ownership) to another tenant. Audited on both sides. */
export async function transferMetaPhone(phoneId: string, toUserId: string, opts: ActorOpts = {}) {
  const phone = await prisma.metaPhone.findUnique({ where: { id: phoneId } });
  if (!phone) return { ok: false as const, reason: "not_found" };
  const target = await prisma.user.findUnique({ where: { id: toUserId }, select: { id: true } });
  if (!target) return { ok: false as const, reason: "target_not_found" };
  const clash = await prisma.metaPhone.findUnique({
    where: { userId_phoneNumberId: { userId: toUserId, phoneNumberId: phone.phoneNumberId } },
  });
  if (clash) return { ok: false as const, reason: "target_has_phone" };
  const updated = await prisma.metaPhone.update({
    where: { id: phoneId },
    data: { userId: toUserId, isPrimary: false },
  });
  await auditMeta({
    userId: phone.userId,
    actorId: opts.actorId,
    actorRole: "admin",
    action: "transfer_phone_out",
    target: phone.phoneNumberId,
    after: { toUserId },
  });
  await auditMeta({
    userId: toUserId,
    actorId: opts.actorId,
    actorRole: "admin",
    action: "transfer_phone_in",
    target: phone.phoneNumberId,
    before: { fromUserId: phone.userId },
  });
  return { ok: true as const, phone: updated };
}

/** Soft-delete (disconnect) a phone. */
export async function removeMetaPhone(phoneId: string, opts: ActorOpts = {}) {
  const phone = await prisma.metaPhone.findUnique({ where: { id: phoneId } });
  if (!phone) return { ok: false as const, reason: "not_found" };
  await prisma.metaPhone.update({
    where: { id: phoneId },
    data: { deletedAt: new Date(), status: "disconnected" },
  });
  await auditMeta({
    userId: phone.userId,
    actorId: opts.actorId,
    actorRole: "admin",
    action: "remove_phone",
    target: phone.phoneNumberId,
  });
  return { ok: true as const };
}
