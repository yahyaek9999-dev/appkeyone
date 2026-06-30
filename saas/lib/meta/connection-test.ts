/**
 * Meta Enterprise Connection Center — comprehensive connection test + diagnostics.
 *
 * BYOM (Bring Your Own Meta): the customer owns the WABA and pays Meta directly.
 * This module ONLY manages the connection — no billing/wallet/credits.
 *
 * REUSE-FIRST: no new tables. Every DB-state check reads the existing `Bot`
 * credential fields; each test run is stored in `MetaSyncHistory` (kind
 * "verification"); state is rolled into `MetaTenant` via patchMetaHealth().
 * Live Meta Graph reachability runs only when META_CLOUD_ENABLED=1 — otherwise
 * it is reported as READY FOR CONFIGURATION (the only such item).
 */

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto-util";
import { getPhoneNumberHealth } from "@/lib/messaging/meta-api";
import { metaCloudGloballyEnabled, metaCloudAllowedForUser } from "@/lib/messaging/feature-flags";
import { normalizeConnectionMode } from "@/lib/messaging/mode";
import { recordSync, patchMetaHealth } from "./tenant";

export type CheckStatus = "pass" | "fail" | "skip" | "ready_for_configuration";
export interface ConnectionCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail?: string | null;
}
export type ConnectionTestOverall = "passed" | "failed" | "ready_for_configuration";

/**
 * Run a full connection test. All DB-state checks (plan, mode, phone, WABA,
 * token, app-secret, webhook token, platform flag) run fully; the live Graph
 * reachability/quality/limit/profile checks run only when the platform flag is
 * on AND credentials are present, else READY FOR CONFIGURATION. Stored in
 * MetaSyncHistory; reflected on MetaTenant.
 */
export async function runConnectionTest(userId: string): Promise<{
  overall: ConnectionTestOverall;
  checks: ConnectionCheck[];
  graph: { qualityRating?: string | null; messagingLimit?: string | null; displayPhone?: string | null; nameStatus?: string | null };
  durationMs: number;
}> {
  const t0 = Date.now();
  const bot = (await prisma.bot.findUnique({
    where: { userId },
    select: {
      connectionMode: true,
      metaPhoneNumberId: true,
      metaBusinessAccountId: true,
      metaAccessTokenEnc: true,
      metaAppSecretEnc: true,
      metaWebhookVerifyToken: true,
    } as any,
  })) as any;
  const eligibility = await metaCloudAllowedForUser(userId);
  const isMeta = normalizeConnectionMode(bot?.connectionMode) === "meta_cloud";
  const flagOn = metaCloudGloballyEnabled();

  const checks: ConnectionCheck[] = [
    { key: "plan", label: "صلاحية الباقة لـ Meta", status: eligibility.access === "none" ? "fail" : "pass", detail: `access=${eligibility.access}` },
    { key: "mode", label: "وضع Meta Cloud مُفعّل", status: isMeta ? "pass" : "fail" },
    { key: "phone_number_id", label: "Phone Number ID", status: bot?.metaPhoneNumberId ? "pass" : "fail" },
    { key: "waba_id", label: "WABA ID", status: bot?.metaBusinessAccountId ? "pass" : "fail" },
    { key: "access_token", label: "Access Token مُخزّن", status: bot?.metaAccessTokenEnc ? "pass" : "fail" },
    { key: "app_secret", label: "App Secret (توقيع Webhook)", status: bot?.metaAppSecretEnc ? "pass" : "fail" },
    { key: "webhook_verify_token", label: "رمز تحقق Webhook", status: bot?.metaWebhookVerifyToken ? "pass" : "fail" },
    { key: "platform_enabled", label: "Meta مُفعّل على المنصّة", status: flagOn ? "pass" : "ready_for_configuration", detail: flagOn ? null : "يتطلب META_CLOUD_ENABLED=1" },
  ];

  const graph: { qualityRating?: string | null; messagingLimit?: string | null; displayPhone?: string | null; nameStatus?: string | null } = {};

  if (isMeta && bot?.metaPhoneNumberId && bot?.metaAccessTokenEnc && flagOn) {
    let token = "";
    try {
      token = decryptSecret(bot.metaAccessTokenEnc);
    } catch {
      /* unreadable */
    }
    if (!token) {
      checks.push({ key: "token_decrypt", label: "قراءة رمز الوصول", status: "fail", detail: "تعذّر فك التشفير — أعد الإدخال" });
    } else {
      const r = await getPhoneNumberHealth({ phoneNumberId: bot.metaPhoneNumberId, token });
      checks.push({ key: "api_reachability", label: "الوصول لـ Meta Graph API", status: r.ok ? "pass" : "fail", detail: r.ok ? null : r.errorDetail || r.errorCode || null });
      if (r.ok) {
        graph.qualityRating = r.data?.quality_rating ?? null;
        graph.messagingLimit = r.data?.messaging_limit_tier ?? null;
        graph.displayPhone = r.data?.display_phone_number ?? null;
        graph.nameStatus = r.data?.name_status ?? null;
        checks.push({ key: "messaging_capability", label: "قدرة المراسلة", status: "pass", detail: graph.messagingLimit });
        checks.push({ key: "quality_rating", label: "تقييم الجودة", status: graph.qualityRating === "RED" ? "fail" : "pass", detail: graph.qualityRating });
        checks.push({ key: "profile", label: "اسم العرض/الحالة", status: "pass", detail: graph.nameStatus });
        // Reuse the existing Bot status cache (same fields the verify route writes).
        await prisma.bot
          .update({ where: { userId }, data: { metaQualityRating: graph.qualityRating, metaMessagingLimit: graph.messagingLimit, metaVerifiedAt: new Date() } as any })
          .catch(() => {});
      }
    }
  } else {
    // Live execution is the ONLY READY FOR CONFIGURATION item (needs prod creds + flag).
    checks.push({ key: "api_reachability", label: "الوصول لـ Meta Graph API", status: "ready_for_configuration", detail: "يتطلب تفعيل المنصّة + بيانات اعتماد حيّة" });
  }

  const failed = checks.filter((c) => c.status === "fail").length;
  const rfc = checks.filter((c) => c.status === "ready_for_configuration").length;
  const overall: ConnectionTestOverall = failed > 0 ? "failed" : rfc > 0 ? "ready_for_configuration" : "passed";
  const durationMs = Date.now() - t0;

  await recordSync({
    userId,
    kind: "verification",
    status: overall === "passed" ? "ok" : overall === "failed" ? "failed" : "partial",
    changed: { overall, checks, graph },
    durationMs,
  });
  await patchMetaHealth(userId, {
    lastApiCheckAt: new Date(),
    verificationStatus: overall === "passed" ? "verified" : overall === "failed" ? "failed" : "pending",
    ...(overall === "passed" ? { verifiedAt: new Date() } : {}),
    ...(graph.qualityRating !== undefined ? { qualityRating: graph.qualityRating } : {}),
    ...(graph.messagingLimit !== undefined ? { messagingLimitTier: graph.messagingLimit } : {}),
  });

  return { overall, checks, graph, durationMs };
}

/**
 * Diagnostics — aggregates connection state + recent verification/sync history
 * + incidents into a single view with a computed health score. Read-only.
 */
export async function getConnectionDiagnostics(userId: string) {
  const [tenant, recentSync, lastOk, lastFail, openIncidents, recentIncidents] = await Promise.all([
    prisma.metaTenant.findUnique({ where: { userId } }),
    prisma.metaSyncHistory.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.metaSyncHistory.findFirst({ where: { userId, status: "ok" }, orderBy: { createdAt: "desc" } }),
    prisma.metaSyncHistory.findFirst({ where: { userId, status: "failed" }, orderBy: { createdAt: "desc" } }),
    prisma.metaIncident.count({ where: { userId, status: { in: ["open", "acknowledged"] } } }),
    prisma.metaIncident.findMany({ where: { userId }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 10 }),
  ]);

  const durations = recentSync.map((s) => s.durationMs).filter((d) => d > 0);
  const avgLatencyMs = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

  let healthScore = 100;
  if (tenant?.healthStatus === "down") healthScore -= 60;
  else if (tenant?.healthStatus === "degraded") healthScore -= 30;
  healthScore -= Math.min(40, openIncidents * 15);
  if (tenant?.qualityRating === "RED") healthScore -= 20;
  else if (tenant?.qualityRating === "YELLOW") healthScore -= 10;
  healthScore = Math.max(0, healthScore);

  return {
    connectionStatus: tenant?.connectionStatus ?? "disconnected",
    verificationStatus: tenant?.verificationStatus ?? "unverified",
    healthStatus: tenant?.healthStatus ?? "unknown",
    qualityRating: tenant?.qualityRating ?? null,
    messagingLimitTier: tenant?.messagingLimitTier ?? null,
    lastApiSuccessAt: lastOk?.createdAt ?? null,
    lastApiFailureAt: lastFail?.createdAt ?? null,
    lastSyncAt: tenant?.lastSyncAt ?? null,
    lastWebhookAt: tenant?.lastWebhookAt ?? null,
    lastError: tenant?.lastError ?? null,
    avgLatencyMs,
    openIncidents,
    recentIncidents,
    recentRuns: recentSync.map((s) => ({ kind: s.kind, status: s.status, durationMs: s.durationMs, at: s.createdAt })),
    healthScore,
  };
}
