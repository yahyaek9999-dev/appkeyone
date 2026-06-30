/**
 * Meta Enterprise — health engine.
 *
 * Evaluates a tenant's Meta posture from CURRENT DB state and raises/auto-
 * resolves incidents, then rolls the worst severity into MetaTenant.healthStatus.
 * Detected conditions: missing/expired token, unconfigured webhook, empty
 * balance, disconnected/flagged/banned phones, quality downgrades.
 *
 * The LIVE Meta Graph call that refreshes quality_rating / messaging_limit is
 * READY FOR CONFIGURATION (needs prod credentials) — the DETECTION logic here
 * runs fully and is what drives the incident center + tenant health badge.
 */

import { prisma } from "@/lib/db";
import { normalizeConnectionMode } from "@/lib/messaging/mode";
import { ensureMetaTenant, patchMetaHealth, recordSync } from "./tenant";
import { openIncident, autoResolveByKey, type IncidentSeverity } from "./incidents";

interface Finding {
  type: string;
  key: string;
  title: string;
  detail: string;
  severity: IncidentSeverity;
}

/** Run a health check for one tenant. Idempotent: re-running converges. */
export async function runHealthCheck(userId: string) {
  const t0 = Date.now();
  await ensureMetaTenant(userId);
  const [bot, wallet, phones] = await Promise.all([
    prisma.bot.findUnique({
      where: { userId },
      select: {
        connectionMode: true,
        metaAccessTokenEnc: true,
        metaWebhookVerifyToken: true,
        metaQualityRating: true,
      } as any,
    }) as any,
    prisma.wallet.findUnique({ where: { userId }, select: { balanceUsd: true } }),
    prisma.metaPhone.findMany({ where: { userId, deletedAt: null } }),
  ]);

  const findings: Finding[] = [];
  const isMeta = normalizeConnectionMode(bot?.connectionMode) === "meta_cloud";

  if (isMeta && !bot?.metaAccessTokenEnc)
    findings.push({
      type: "token_expired",
      key: "token",
      title: "رمز Meta مفقود/منتهٍ",
      detail: "وضع Meta مفعّل لكن لا يوجد Access Token.",
      severity: "high",
    });
  if (isMeta && !bot?.metaWebhookVerifyToken)
    findings.push({
      type: "webhook_failure",
      key: "webhook",
      title: "Webhook غير مُهيّأ",
      detail: "لا يوجد رمز تحقق Webhook.",
      severity: "medium",
    });

  const bal = wallet?.balanceUsd ?? 0;
  if (bal <= 0)
    findings.push({
      type: "low_balance",
      key: "balance",
      title: "الرصيد منتهٍ",
      detail: `الرصيد الحالي $${bal.toFixed(2)}.`,
      severity: bal < 0 ? "high" : "medium",
    });

  for (const p of phones) {
    if (["disconnected", "flagged", "banned", "restricted"].includes(p.status)) {
      const sev: IncidentSeverity =
        p.status === "banned" ? "critical" : p.status === "restricted" ? "high" : "medium";
      findings.push({
        type: "phone_disconnected",
        key: `phone:${p.id}`,
        title: `رقم بحالة ${p.status}`,
        detail: p.displayPhone || p.phoneNumberId,
        severity: sev,
      });
    }
    if (p.qualityRating === "RED")
      findings.push({
        type: "quality_downgrade",
        key: `quality:${p.id}`,
        title: "جودة الرقم منخفضة (RED)",
        detail: p.displayPhone || p.phoneNumberId,
        severity: "high",
      });
    else if (p.qualityRating === "YELLOW")
      findings.push({
        type: "quality_downgrade",
        key: `quality:${p.id}`,
        title: "جودة الرقم متوسطة (YELLOW)",
        detail: p.displayPhone || p.phoneNumberId,
        severity: "medium",
      });
  }
  if (bot?.metaQualityRating === "RED")
    findings.push({
      type: "quality_downgrade",
      key: "quality:tenant",
      title: "جودة الحساب منخفضة (RED)",
      detail: "",
      severity: "high",
    });

  // Open new incidents; auto-resolve cleared ones.
  const activeKeys = new Set(findings.map((f) => f.key));
  let opened = 0;
  for (const f of findings) {
    const r = await openIncident({
      userId,
      type: f.type,
      dedupeKey: f.key,
      title: f.title,
      detail: f.detail,
      severity: f.severity,
    });
    if (r.created) opened++;
  }
  const openInc = await prisma.metaIncident.findMany({
    where: { userId, status: { in: ["open", "acknowledged"] } },
    select: { dedupeKey: true },
  });
  let resolved = 0;
  for (const key of new Set(openInc.map((i) => i.dedupeKey))) {
    if (!activeKeys.has(key)) resolved += await autoResolveByKey(userId, key);
  }

  const worst = findings.reduce(
    (acc, f) => Math.max(acc, f.severity === "critical" || f.severity === "high" ? 2 : 1),
    0,
  );
  const healthStatus = !isMeta
    ? "unknown"
    : worst === 2
      ? "down"
      : worst === 1
        ? "degraded"
        : "healthy";
  await patchMetaHealth(userId, {
    healthStatus,
    lastApiCheckAt: new Date(),
    lastSyncAt: new Date(),
    connectionStatus: isMeta ? (bot?.metaAccessTokenEnc ? "connected" : "error") : "disconnected",
  });
  await recordSync({
    userId,
    kind: "health",
    status: findings.length ? "partial" : "ok",
    changed: { findings: findings.length, opened, resolved },
    durationMs: Date.now() - t0,
  });

  return { healthStatus, findings: findings.length, opened, resolved };
}

/** Sweep all provisioned tenants (cron / admin). */
export async function runHealthSweep(limit = 500) {
  const tenants = await prisma.metaTenant.findMany({
    where: { deletedAt: null },
    select: { userId: true },
    take: limit,
  });
  let checked = 0;
  let incidentsOpened = 0;
  for (const t of tenants) {
    const r = await runHealthCheck(t.userId);
    checked++;
    incidentsOpened += r.opened;
  }
  return { checked, incidentsOpened };
}
