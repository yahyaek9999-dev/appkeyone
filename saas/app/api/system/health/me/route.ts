/**
 * GET /api/system/health/me — TENANT-scoped health.
 *
 * Why this exists: /dashboard/system-health is a customer destination gated on
 * `system_health`, a capability sold from Pro up. Its only data source was
 * /api/system/health, which is platform-ops by design — host CPU/RAM, database
 * size, cross-tenant counts — and therefore 403s every tenant. So a merchant
 * bought a feature whose page could never show them anything.
 *
 * This endpoint answers the question the merchant is actually asking: "is MY
 * setup working?" Every figure below is scoped to the caller's own workspace.
 *
 * DELIBERATELY ABSENT, and must stay absent: host CPU/memory/heap, process
 * uptime, database file size, and any count that spans tenants. Those live on
 * the admin endpoint and are the reason it is admin-only. Adding one here would
 * leak platform internals to every Pro customer.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiGate } from "@/lib/membership/gate";

export const dynamic = "force-dynamic";

const db = prisma as any;

type Level = "ok" | "warn" | "down" | "idle";

interface Section {
  level: Level;
  /** One line the merchant can act on. Never a status code or an exception. */
  summary: string;
}

/** Each probe is independent: one failing area must not blank the whole page. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function GET() {
  const g = await apiGate("system_health");
  if (g.response) return g.response;
  const uid = g.uid!;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [bot, numbers, delivery, integrations, automationRules, commerceAutomations, aiProviders, messages24h] =
    await Promise.all([
      safe<{ connectionMode?: string; whatsappStatus?: string; whatsappPhone?: string | null } | null>(
        () =>
          db.bot.findUnique({
            where: { userId: uid },
            select: { connectionMode: true, whatsappStatus: true, whatsappPhone: true },
          }),
        null,
      ),
      safe(
        () =>
          db.whatsAppNumber.findMany({
            where: { userId: uid },
            select: { id: true, displayName: true, phone: true, status: true, lastError: true, lastConnectedAt: true },
            orderBy: { sortOrder: "asc" },
          }),
        [] as any[],
      ),
      // Delivery health over the last 24h, from this workspace's campaigns only.
      safe(
        () =>
          db.broadcastItem.groupBy({
            by: ["status"],
            where: { broadcast: { userId: uid }, OR: [{ sentAt: { gte: since } }, { sentAt: null }] },
            _count: { _all: true },
          }),
        [] as any[],
      ),
      safe(
        () =>
          db.commerceIntegration.findMany({
            where: { userId: uid },
            select: { id: true, name: true, platform: true, enabled: true, connectionStatus: true, lastSyncError: true },
          }),
        [] as any[],
      ),
      safe(() => db.automationRule.count({ where: { userId: uid, enabled: true } }), 0),
      safe(() => db.commerceAutomation.count({ where: { userId: uid, enabled: true } }), 0),
      safe(
        () =>
          db.tenantProviderCredential.findMany({
            where: { userId: uid, domain: "ai" },
            select: { provider: true, enabled: true },
          }),
        [] as any[],
      ),
      safe(
        () =>
          db.message.count({
            where: { createdAt: { gte: since }, conversation: { customer: { userId: uid } } },
          }),
        0,
      ),
    ]);

  // ── connection ───────────────────────────────────────────────────────────
  const mode: string = bot?.connectionMode === "meta_cloud" ? "meta" : "qr";
  const waStatus: string = bot?.whatsappStatus ?? "disconnected";
  const connection: Section & { mode: string; phone: string | null } = {
    mode,
    phone: bot?.whatsappPhone ?? null,
    level: waStatus === "connected" ? "ok" : waStatus === "connecting" ? "warn" : "down",
    summary:
      waStatus === "connected"
        ? `متصل${bot?.whatsappPhone ? ` — ${bot.whatsappPhone}` : ""}`
        : waStatus === "connecting"
          ? "جارٍ الربط — أكمل مسح رمز QR"
          : "غير متصل — لن تُستقبل أو تُرسل رسائل حتى تربط رقمك",
  };

  // ── numbers ──────────────────────────────────────────────────────────────
  const active = numbers.filter((n: any) => n.status === "active").length;
  const failing = numbers.filter((n: any) => n.status === "error" || n.status === "banned");
  const numbersSection: Section & { total: number; active: number; items: any[] } = {
    total: numbers.length,
    active,
    items: numbers.map((n: any) => ({
      id: n.id,
      name: n.displayName || n.phone || "رقم بلا اسم",
      phone: n.phone,
      status: n.status,
      lastError: n.lastError,
    })),
    level: numbers.length === 0 ? "idle" : failing.length > 0 ? "down" : active > 0 ? "ok" : "warn",
    summary:
      numbers.length === 0
        ? "لم تُسجَّل أرقام واتساب بعد"
        : failing.length > 0
          ? `${failing.length} رقم به مشكلة تحتاج تدخلك`
          : `${active} من ${numbers.length} رقم نشط`,
  };

  // ── delivery ─────────────────────────────────────────────────────────────
  const byStatus: Record<string, number> = {};
  for (const row of delivery) byStatus[row.status] = row._count?._all ?? 0;
  const sent = byStatus.sent ?? 0;
  const failed = byStatus.failed ?? 0;
  const pending = byStatus.pending ?? 0;
  const deliverySection: Section & { sent: number; failed: number; pending: number } = {
    sent,
    failed,
    pending,
    level: failed > 0 ? (sent === 0 ? "down" : "warn") : sent + pending === 0 ? "idle" : "ok",
    summary:
      sent + failed + pending === 0
        ? "لا توجد رسائل حملات خلال آخر ٢٤ ساعة"
        : failed > 0
          ? `${failed} رسالة فشل إرسالها من أصل ${sent + failed}`
          : `${sent} رسالة أُرسلت بنجاح${pending ? ` · ${pending} في الانتظار` : ""}`,
  };

  // ── integrations ─────────────────────────────────────────────────────────
  const enabledIntegrations = integrations.filter((i: any) => i.enabled);
  const brokenIntegrations = enabledIntegrations.filter(
    (i: any) => i.connectionStatus === "failed" || i.connectionStatus === "degraded",
  );
  const integrationsSection: Section & { total: number; items: any[] } = {
    total: enabledIntegrations.length,
    items: enabledIntegrations.map((i: any) => ({
      id: i.id,
      name: i.name || i.platform,
      platform: i.platform,
      status: i.connectionStatus,
      lastError: i.lastSyncError,
    })),
    level: enabledIntegrations.length === 0 ? "idle" : brokenIntegrations.length > 0 ? "down" : "ok",
    summary:
      enabledIntegrations.length === 0
        ? "لا يوجد متجر مربوط"
        : brokenIntegrations.length > 0
          ? `${brokenIntegrations.length} تكامل يحتاج إعادة ربط`
          : `${enabledIntegrations.length} تكامل يعمل`,
  };

  // ── automations ──────────────────────────────────────────────────────────
  const automationsOn = automationRules + commerceAutomations;
  const automationsSection: Section & { enabled: number } = {
    enabled: automationsOn,
    level: automationsOn > 0 ? "ok" : "idle",
    summary: automationsOn > 0 ? `${automationsOn} قاعدة أتمتة مفعّلة` : "لا توجد قواعد أتمتة مفعّلة",
  };

  // ── assistant ────────────────────────────────────────────────────────────
  const ownAi = aiProviders.filter((p: any) => p.enabled);
  const assistantSection: Section & { provider: string } = {
    provider: ownAi.length > 0 ? ownAi.map((p: any) => p.provider).join("، ") : "KEYONE AI",
    level: "ok",
    summary:
      ownAi.length > 0
        ? `يعمل بمزوّدك الخاص (${ownAi.map((p: any) => p.provider).join("، ")})`
        : "يعمل بمزوّد KEYONE الافتراضي",
  };

  const sections = {
    connection,
    numbers: numbersSection,
    delivery: deliverySection,
    integrations: integrationsSection,
    automations: automationsSection,
    assistant: assistantSection,
  };

  const levels = Object.values(sections).map((s: any) => s.level as Level);
  const overall: Level = levels.includes("down") ? "down" : levels.includes("warn") ? "warn" : "ok";

  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    overall,
    messages24h,
    sections,
  });
}
