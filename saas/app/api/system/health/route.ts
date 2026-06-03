// System monitoring — aggregated health endpoint (read-only, bounded).
// Gathers everything the ops dashboard needs into one response.
// No new models — pure aggregation of existing tables.
//
// FAIL-OPEN CONTRACT: no single subsystem may break the whole response. Every
// provider is wrapped so a thrown error / bad value becomes a per-subsystem
// "down"/"warning" verdict (captured to Sentry) — never a generic 500 or a
// "health_check_failed" blanket. The endpoint ALWAYS returns 200 with whatever
// it could gather. This page must render even when a dependency is unhealthy.
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import * as os from "os";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Per-subsystem status verdict. "down" = hard failure, "degraded" = working
// but needs attention, "ok" = healthy, "unknown" = no signal (e.g. idle).
type SubsystemState = "ok" | "degraded" | "down" | "unknown";
type Subsystem = { status: SubsystemState; detail: string };

// Worker-drain staleness threshold. If the oldest queued WA message has been
// waiting longer than this, the worker is likely not draining the queue.
const WORKER_STALE_SEC = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Provider runner: executes one async probe, NEVER throws. On error it reports
// to Sentry and returns the supplied fallback so aggregation continues.
// ---------------------------------------------------------------------------
async function provider<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    Sentry.captureException(err, { tags: { scope: "system-health", provider: name } });
    return fallback;
  }
}

// Coerce any numeric-ish value (incl. BigInt from raw SQLite queries) to a
// JSON-safe number. BigInt is the #1 cause of NextResponse.json() throwing.
function toSafeNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(v as any);
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  const uid = await getUserId().catch(() => null);
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86400000);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const yesterdayKey = dayAgo.toISOString().slice(0, 10);
  const weekKey = weekAgo.toISOString().slice(0, 10);

  // Every probe is individually fail-open via provider(). Promise.allSettled
  // guarantees the array always resolves even if a provider somehow still
  // rejects (defense-in-depth on top of provider()).
  const settled = await Promise.allSettled([
    /* 0  waSessions      */ provider("wa-sessions", () => prisma.bot.count({ where: { whatsappStatus: "connected" } }), 0),
    /* 1  queueDepth      */ provider("queue-depth", () => prisma.waMessage.count({ where: { status: "queued" } }), 0),
    /* 2  failed24h       */ provider("failed-24h", () => prisma.waMessage.count({ where: { status: "failed", failedAt: { gte: dayAgo } } }), 0),
    /* 3  deadLetter      */ provider("dead-letter", () => prisma.waMessage.count({ where: { status: "failed", attempts: { gte: 5 } } }), 0),
    /* 4  critical24h     */ provider("safety-critical", () => prisma.safetyAudit.count({ where: { level: "critical", createdAt: { gte: dayAgo } } }), 0),
    /* 5  warn24h         */ provider("safety-warn", () => prisma.safetyAudit.count({ where: { level: "warn", createdAt: { gte: dayAgo } } }), 0),
    /* 6  aiUsage7d       */ provider("ai-usage-7d", () => prisma.providerUsage.aggregate({ where: { day: { gte: weekKey } }, _sum: { calls: true, inputTokens: true, outputTokens: true } }), { _sum: { calls: null, inputTokens: null, outputTokens: null } } as any),
    /* 7  cacheHits7d     */ provider("cache-hits-7d", () => prisma.metricEvent.aggregate({ where: { kind: "cache_hit", day: { gte: weekKey } }, _sum: { count: true } }), { _sum: { count: null } } as any),
    /* 8  msgCount        */ provider("msg-count", () => prisma.message.count(), 0),
    /* 9  custCount       */ provider("cust-count", () => prisma.customer.count(), 0),
    /* 10 ordCount        */ provider("ord-count", () => prisma.order.count(), 0),
    /* 11 dbSizeBytes     */ provider<number | null>("db-size", async () => {
      const rows = await prisma.$queryRawUnsafe<{ size: unknown }[]>(
        "SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()"
      );
      // SQLite raw integer arithmetic returns BigInt — coerce or NextResponse
      // .json() throws "Do not know how to serialize a BigInt".
      return rows.length ? toSafeNumber(rows[0].size) : null;
    }, null),
    /* 12 broadcastsSending */ provider("broadcasts-sending", () => prisma.broadcast.count({ where: { status: "sending" } }), 0),
    /* 13 broadcastsQueued  */ provider("broadcasts-queued", () => prisma.broadcast.count({ where: { status: "queued" } }), 0),
    /* 14 dbPing          */ provider("db-ping", () => prisma.$queryRaw`SELECT 1`.then(() => true), false),
    /* 15 redisOk         */ provider("redis-ping", () => redis.ping(), false),
    /* 16 aiUsage24h      */ provider("ai-usage-24h", () => prisma.providerUsage.aggregate({ where: { day: { gte: yesterdayKey } }, _sum: { calls: true, failures: true } }), { _sum: { calls: null, failures: null } } as any),
    /* 17 queueHealth     */ provider<any>("queue-health", async () => {
      const { getOutgoingQueueHealth } = await import("@/lib/messaging/outgoing-queue");
      return await getOutgoingQueueHealth();
    }, null),
  ]);

  // allSettled never rejects; unwrap with a hard fallback just in case.
  const val = <T>(i: number, fallback: T): T => {
    const r = settled[i];
    return r.status === "fulfilled" ? (r.value as T) : fallback;
  };

  const waSessions = val(0, 0) as number;
  const queueDepth = val(1, 0) as number;
  const failed24h = val(2, 0) as number;
  const deadLetter = val(3, 0) as number;
  const critical24h = val(4, 0) as number;
  const warn24h = val(5, 0) as number;
  const aiUsage = val(6, { _sum: { calls: null, inputTokens: null, outputTokens: null } } as any);
  const cacheHits7d = val(7, { _sum: { count: null } } as any);
  const msgCount = val(8, 0) as number;
  const custCount = val(9, 0) as number;
  const ordCount = val(10, 0) as number;
  const dbSizeBytes = val<number | null>(11, null);
  const broadcastsSending = val(12, 0) as number;
  const broadcastsQueued = val(13, 0) as number;
  const dbPing = val(14, false) as boolean;
  const redisOk = val(15, false) as boolean;
  const aiUsage24h = val(16, { _sum: { calls: null, failures: null } } as any);
  const queueHealth = val<any>(17, null);

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
  const aiCalls = aiUsage24h?._sum?.calls ?? 0;
  const aiFails = aiUsage24h?._sum?.failures ?? 0;
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

  const version = process.env.NEXT_PUBLIC_BUILD_ID || process.env.BUILD_ID || "dev";

  // Server metrics — os/process calls don't touch the DB but guard anyway so a
  // platform quirk can't break the response.
  let server: any;
  try {
    const mem = process.memoryUsage();
    const cpus = os.cpus();
    const totalMemMB = Math.round(os.totalmem() / 1048576);
    const freeMemMB = Math.round(os.freemem() / 1048576);
    server = {
      cpuModel: cpus[0]?.model || "unknown",
      cpuCores: cpus.length,
      totalMemMB,
      freeMemMB,
      usedMemMB: totalMemMB - freeMemMB,
      heapUsedMB: Math.round(mem.heapUsed / 1048576),
      heapTotalMB: Math.round(mem.heapTotal / 1048576),
      rssMB: Math.round(mem.rss / 1048576),
      uptimeSec: Math.floor(process.uptime()),
    };
  } catch (err) {
    Sentry.captureException(err, { tags: { scope: "system-health", provider: "server-metrics" } });
    server = { cpuModel: "unknown", cpuCores: 0, totalMemMB: 0, freeMemMB: 0, usedMemMB: 0, heapUsedMB: 0, heapTotalMB: 0, rssMB: 0, uptimeSec: 0 };
  }

  // Overall verdict: worst subsystem wins. "down" anywhere → down,
  // else any "degraded" → degraded, else ok.
  const states = Object.values(subsystems).map((s) => s.status);
  const overall: SubsystemState = states.includes("down")
    ? "down"
    : states.includes("degraded")
      ? "degraded"
      : "ok";

  // Build the payload, then guard the final serialization explicitly. If any
  // stray non-serializable value remains, we still return a useful response
  // (subsystems + overall) rather than a blanket failure.
  const payload = {
    ts: now.toISOString(),
    overall,
    version,
    subsystems,
    server,
    database: {
      sizeBytes: dbSizeBytes,
      messages: toSafeNumber(msgCount) ?? 0,
      customers: toSafeNumber(custCount) ?? 0,
      orders: toSafeNumber(ordCount) ?? 0,
    },
    queue: { queued: queueDepth, failed24h, deadLetter },
    whatsapp: { activeSessions: waSessions },
    ai: {
      calls7d: toSafeNumber(aiUsage?._sum?.calls) ?? 0,
      inputTokens7d: toSafeNumber(aiUsage?._sum?.inputTokens) ?? 0,
      outputTokens7d: toSafeNumber(aiUsage?._sum?.outputTokens) ?? 0,
      cacheHits7d: toSafeNumber(cacheHits7d?._sum?.count) ?? 0,
    },
    errors: { critical24h, warn24h },
    broadcasts: { sending: broadcastsSending, queued: broadcastsQueued },
  };

  try {
    return NextResponse.json(payload);
  } catch (err) {
    // Should be unreachable now that all numeric fields are coerced, but if a
    // value still can't serialize we report it and return the subsystem map
    // (the part the dashboard most needs) via a BigInt-safe replacer.
    Sentry.captureException(err, { tags: { scope: "system-health", provider: "serialize" } });
    const safe = JSON.parse(
      JSON.stringify(payload, (_k, v) => (typeof v === "bigint" ? Number(v) : v))
    );
    return NextResponse.json(safe);
  }
}
