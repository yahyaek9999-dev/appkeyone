// System monitoring — aggregated health endpoint (read-only, bounded).
// Gathers everything the ops dashboard needs into one response.
// No new models — pure aggregation of existing tables.
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { getOutgoingQueueHealth } from "@/lib/messaging/outgoing-queue";
import * as os from "os";

export const dynamic = "force-dynamic";

// Per-subsystem status verdict. "down" = hard failure, "degraded" = working
// but needs attention, "ok" = healthy, "unknown" = no signal (e.g. idle).
// Every probe below is independently try/caught so one failing subsystem can
// never crash the whole endpoint — the page must function even when a
// dependency is down (Phase 0 monitoring-hardening requirement).
type SubsystemState = "ok" | "degraded" | "down" | "unknown";
type Subsystem = { status: SubsystemState; detail: string };

// Worker-drain staleness threshold. If the oldest queued WA message has been
// waiting longer than this, the worker is likely not draining the queue.
const WORKER_STALE_SEC = 300; // 5 minutes

export async function GET() {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86400000);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const yesterdayKey = dayAgo.toISOString().slice(0, 10);

  const [
    waSessions, queueDepth, failed24h, deadLetter, critical24h, warn24h,
    aiUsage, cacheHits7d, msgCount, custCount, ordCount, dbSizeResult,
    broadcastsSending, broadcastsQueued,
    // ---- subsystem probes (additive) ----
    dbPing, redisOk, aiUsage24h, queueHealth,
  ] = await Promise.all([
    prisma.bot.count({ where: { whatsappStatus: "connected" } }).catch(() => 0),
    prisma.waMessage.count({ where: { status: "queued" } }).catch(() => 0),
    prisma.waMessage.count({ where: { status: "failed", failedAt: { gte: dayAgo } } }).catch(() => 0),
    // Dead-letter = messages that failed and exhausted all retries (attempts >= 5)
    prisma.waMessage.count({ where: { status: "failed", attempts: { gte: 5 } } }).catch(() => 0),
    prisma.safetyAudit.count({ where: { level: "critical", createdAt: { gte: dayAgo } } }).catch(() => 0),
    prisma.safetyAudit.count({ where: { level: "warn", createdAt: { gte: dayAgo } } }).catch(() => 0),
    prisma.providerUsage
      .aggregate({ where: { day: { gte: weekAgo.toISOString().slice(0, 10) } }, _sum: { calls: true, inputTokens: true, outputTokens: true } })
      .catch(() => ({ _sum: { calls: null, inputTokens: null, outputTokens: null } })),
    // LLM cache hits (7d) — from MetricEvent (day is a "YYYY-MM-DD" string)
    prisma.metricEvent.aggregate({ where: { kind: "cache_hit", day: { gte: weekAgo.toISOString().slice(0, 10) } }, _sum: { count: true } }).catch(() => ({ _sum: { count: null } })),
    prisma.message.count().catch(() => 0),
    prisma.customer.count().catch(() => 0),
    prisma.order.count().catch(() => 0),
    prisma.$queryRawUnsafe<{ size: number }[]>("SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()").catch(() => []),
    prisma.broadcast.count({ where: { status: "sending" } }).catch(() => 0),
    prisma.broadcast.count({ where: { status: "queued" } }).catch(() => 0),
    // DB liveness: a trivial SELECT 1 exercises the connection pool.
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    // Redis liveness: PING. redis.ping() never throws (returns false on error).
    redis.ping().catch(() => false),
    // AI provider reliability (last ~24h): calls vs failures across all tenants.
    prisma.providerUsage
      .aggregate({ where: { day: { gte: yesterdayKey } }, _sum: { calls: true, failures: true } })
      .catch(() => ({ _sum: { calls: null, failures: null } })),
    // Queue/worker drain health — oldest-queued age proxies worker liveness.
    getOutgoingQueueHealth().catch(() => null),
  ]);

  // ---- Derive per-subsystem verdicts (honest signals only) ------------------
  const subsystems: Record<string, Subsystem> = {};

  subsystems.database = dbPing
    ? { status: "ok", detail: "متصلة وتستجيب" }
    : { status: "down", detail: "تعذّر الاتصال بقاعدة البيانات" };

  // Redis is optional in dev. In production a failing ping is degraded (caching
  // / rate-limiting fall back to DB), not a hard outage.
  const redisConfigured = !!process.env.UPSTASH_REDIS_REST_URL;
  subsystems.redis = redisOk
    ? { status: "ok", detail: "يستجيب لـ PING" }
    : redisConfigured
      ? { status: "degraded", detail: "لا يستجيب — الكاش يعمل بالاحتياطي" }
      : { status: "unknown", detail: "غير مُهيّأ (اختياري)" };

  subsystems.whatsapp = waSessions > 0
    ? { status: "ok", detail: `${waSessions} جلسة متصلة` }
    : { status: "degraded", detail: "لا توجد جلسات متصلة حالياً" };

  // Queue: dead-letter is the worst signal, then 24h failures, then backlog.
  subsystems.queue =
    deadLetter > 0
      ? { status: "degraded", detail: `${deadLetter} رسالة في dead-letter` }
      : failed24h > 0
        ? { status: "degraded", detail: `${failed24h} فشل إرسال خلال 24س` }
        : queueDepth > 50
          ? { status: "degraded", detail: `${queueDepth} رسالة في الانتظار` }
          : { status: "ok", detail: "الطابور سليم" };

  // AI provider: judge by failure ratio over the last 24h of metered calls.
  const aiCalls = aiUsage24h._sum.calls ?? 0;
  const aiFails = (aiUsage24h._sum as any).failures ?? 0;
  const aiFailRatio = aiCalls > 0 ? aiFails / aiCalls : 0;
  subsystems.aiProvider =
    aiCalls === 0
      ? { status: "unknown", detail: "لا استدعاءات خلال 24س" }
      : aiFailRatio >= 0.5
        ? { status: "down", detail: `فشل ${Math.round(aiFailRatio * 100)}% من الاستدعاءات` }
        : aiFailRatio >= 0.1
          ? { status: "degraded", detail: `فشل ${Math.round(aiFailRatio * 100)}% من الاستدعاءات` }
          : { status: "ok", detail: `${aiCalls.toLocaleString("ar-EG")} استدعاء، أخطاء ضئيلة` };

  // Worker liveness is inferred from queue drain, not a dedicated heartbeat:
  // if items sit queued past WORKER_STALE_SEC the worker likely isn't draining.
  const oldestAge = queueHealth?.oldestQueuedAgeSec ?? 0;
  const staleQueued = queueHealth?.staleQueued ?? 0;
  subsystems.worker =
    queueHealth === null
      ? { status: "unknown", detail: "تعذّر قراءة حالة الطابور" }
      : staleQueued > 0 || oldestAge > WORKER_STALE_SEC
        ? { status: "degraded", detail: `أقدم رسالة منتظرة منذ ${Math.round(oldestAge / 60)}د` }
        : { status: "ok", detail: "يُفرّغ الطابور بانتظام" };

  const version =
    process.env.NEXT_PUBLIC_BUILD_ID || process.env.BUILD_ID || "dev";

  const mem = process.memoryUsage();
  const cpus = os.cpus();
  const totalMemMB = Math.round(os.totalmem() / 1048576);
  const freeMemMB = Math.round(os.freemem() / 1048576);

  // Overall verdict: worst subsystem wins. "down" anywhere → down,
  // else any "degraded" → degraded, else ok.
  const states = Object.values(subsystems).map((s) => s.status);
  const overall: SubsystemState = states.includes("down")
    ? "down"
    : states.includes("degraded")
      ? "degraded"
      : "ok";

  return NextResponse.json({
    ts: now.toISOString(),
    overall,
    version,
    subsystems,
    server: {
      cpuModel: cpus[0]?.model || "unknown",
      cpuCores: cpus.length,
      totalMemMB,
      freeMemMB,
      usedMemMB: totalMemMB - freeMemMB,
      heapUsedMB: Math.round(mem.heapUsed / 1048576),
      heapTotalMB: Math.round(mem.heapTotal / 1048576),
      rssMB: Math.round(mem.rss / 1048576),
      uptimeSec: Math.floor(process.uptime()),
    },
    database: {
      sizeBytes: dbSizeResult.length > 0 ? (dbSizeResult as any[])[0].size : null,
      messages: msgCount,
      customers: custCount,
      orders: ordCount,
    },
    queue: {
      queued: queueDepth,
      failed24h,
      deadLetter,
    },
    whatsapp: { activeSessions: waSessions },
    ai: {
      calls7d: aiUsage._sum.calls ?? 0,
      inputTokens7d: aiUsage._sum.inputTokens ?? 0,
      outputTokens7d: aiUsage._sum.outputTokens ?? 0,
      cacheHits7d: (cacheHits7d as any)._sum?.count ?? 0,
    },
    errors: { critical24h, warn24h },
    broadcasts: { sending: broadcastsSending, queued: broadcastsQueued },
  });
}
