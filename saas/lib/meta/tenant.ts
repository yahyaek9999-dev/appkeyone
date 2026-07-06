/**
 * Meta Enterprise — tenant lifecycle, audit, and sync history.
 *
 * `MetaTenant` is the platform's control/health record for a tenant's Meta
 * presence (separate from `Bot`, which holds the raw encrypted credentials and
 * the live send path). Every privileged action is written to `MetaAudit`;
 * every health/sync run is written to `MetaSyncHistory`.
 */

import { prisma } from "@/lib/db";

export const META_TENANT_STATUSES = [
  "pending",
  "enabled",
  "disabled",
  "suspended",
  "expired",
  "blocked",
  "maintenance",
] as const;
export type MetaTenantStatus = (typeof META_TENANT_STATUSES)[number];

export type MetaActorRole = "admin" | "customer" | "system";

/** Get-or-create the tenant's Meta operational profile. */
export async function ensureMetaTenant(userId: string) {
  return prisma.metaTenant.upsert({ where: { userId }, create: { userId }, update: {} });
}

/** Append an immutable audit record for a privileged Meta action. */
export async function auditMeta(input: {
  userId?: string | null;
  actorId?: string | null;
  actorRole?: MetaActorRole;
  action: string;
  target?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  note?: string | null;
}) {
  return prisma.metaAudit.create({
    data: {
      userId: input.userId ?? null,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? "system",
      action: input.action,
      target: input.target ?? null,
      before: JSON.stringify(input.before ?? {}),
      after: JSON.stringify(input.after ?? {}),
      ip: input.ip ?? null,
      note: input.note ?? null,
    },
  });
}

/** Transition a tenant's lifecycle status (idempotent + audited + versioned). */
export async function setMetaStatus(
  userId: string,
  status: MetaTenantStatus,
  opts: { actorId?: string; actorRole?: MetaActorRole; reason?: string; ip?: string } = {},
) {
  const before = await ensureMetaTenant(userId);
  if (before.status === status) {
    return { ok: true as const, changed: false, tenant: before };
  }
  const tenant = await prisma.metaTenant.update({
    where: { userId },
    data: {
      status,
      statusReason: opts.reason ?? null,
      statusChangedAt: new Date(),
      version: { increment: 1 },
    },
  });
  await auditMeta({
    userId,
    actorId: opts.actorId,
    actorRole: opts.actorRole ?? "admin",
    action: `status:${status}`,
    before: { status: before.status },
    after: { status },
    ip: opts.ip,
    note: opts.reason,
  });
  return { ok: true as const, changed: true, tenant };
}

/** Patch health/connection telemetry on the tenant profile (health engine). */
export async function patchMetaHealth(
  userId: string,
  patch: Partial<{
    connectionStatus: string;
    verificationStatus: string;
    verifiedAt: Date | null;
    healthStatus: string;
    qualityRating: string | null;
    messagingLimitTier: string | null;
    lastSyncAt: Date | null;
    lastErrorAt: Date | null;
    lastError: string | null;
    lastWebhookAt: Date | null;
    lastApiCheckAt: Date | null;
  }>,
) {
  await ensureMetaTenant(userId);
  return prisma.metaTenant.update({ where: { userId }, data: patch });
}

/** Record a sync / health-check run in MetaSyncHistory. */
export async function recordSync(input: {
  userId?: string | null;
  kind: "health" | "quality" | "phone" | "webhook" | "usage" | "full" | string;
  status?: "ok" | "partial" | "failed";
  changed?: unknown;
  error?: string | null;
  durationMs?: number;
}) {
  return prisma.metaSyncHistory.create({
    data: {
      userId: input.userId ?? null,
      kind: input.kind,
      status: input.status ?? "ok",
      changed: JSON.stringify(input.changed ?? {}),
      error: input.error ?? null,
      durationMs: input.durationMs ?? 0,
    },
  });
}
