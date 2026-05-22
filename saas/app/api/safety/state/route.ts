import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadState } from "@/lib/safety/store";
import { getStageLimits, type StageLimits } from "@/lib/safety/warmup";

export const dynamic = "force-dynamic";

type ReasonCount = { reason: string; count: number };

export async function GET() {
  const user = await requireUser();
  const userId = user.id;
  const state = await loadState(userId);
  const limits = getStageLimits(state.warmupStage as StageLimits["stage"]);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [events, audits, queueCounts] = await Promise.all([
    (prisma as any).safetyEvent.findMany({
      where: { userId, createdAt: { gte: since24h } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    (prisma as any).safetyAudit.findMany({
      where: { OR: [{ userId }, { userId: null }], createdAt: { gte: since24h } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    (prisma as any).waMessage?.groupBy
      ? (prisma as any).waMessage.groupBy({
          by: ["status"],
          where: { userId, status: { in: ["queued", "sending", "failed"] } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const queueByStatus = new Map<string, number>();
  for (const r of queueCounts || []) queueByStatus.set(r.status, r._count?._all || 0);

  let sends24h = 0;
  let failures24h = 0;
  let cooldowns24h = 0;
  let reconnects24h = 0;
  let inbound24h = 0;
  let spamFails24h = 0;
  let techFails24h = 0;
  let softenedCount = 0;
  const reasonCounts = new Map<string, number>();
  let lastCooldownReasons: string[] = [];

  for (const e of events as any[]) {
    if (e.kind === "send") sends24h++;
    if (e.kind === "failure") failures24h++;
    if (e.kind === "cooldown") cooldowns24h++;
    if (e.kind === "reconnect") reconnects24h++;
    if (e.kind === "reply") inbound24h++;

    const payload = parsePayload(e.payload);
    if (e.kind === "failure") {
      if (payload.kind === "spam" || payload.kind === "blocked" || payload.kind === "rate_limit") spamFails24h++;
      else techFails24h++;
    }
    const reasons = Array.isArray(payload.reasons) ? payload.reasons : [];
    if (reasons.includes("cooldown_softened_for_inbound")) softenedCount++;
    if (e.kind === "cooldown" && lastCooldownReasons.length === 0) {
      lastCooldownReasons = reasons.slice(0, 6);
    }
    for (const reason of reasons) {
      if (typeof reason !== "string" || !reason) continue;
      reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    }
  }

  const queued = queueByStatus.get("queued") || 0;
  const sending = queueByStatus.get("sending") || 0;
  const failedQueued = queueByStatus.get("failed") || 0;
  const queuePressure = Math.min(1, (queued + sending) / Math.max(1, limits.maxHourly));
  const outboundInboundRatio = sends24h / Math.max(1, inbound24h);
  const healthTrend = pickHealthTrend({
    riskScore: state.riskScore,
    spamFails24h,
    cooldowns24h,
    reconnects24h,
    queuePressure,
  });
  const cooldownRemainingMs = state.cooldownUntil
    ? Math.max(0, new Date(state.cooldownUntil).getTime() - Date.now())
    : 0;

  return NextResponse.json({
    state: { ...state, cooldownRemainingMs },
    limits,
    counters: {
      sends24h,
      failures24h,
      cooldowns24h,
      reconnects24h,
      inbound24h,
      spamFails24h,
      techFails24h,
      softenedCount,
    },
    queue: {
      queued,
      sending,
      failed: failedQueued,
      pressure: queuePressure,
    },
    diagnostics: {
      outboundInboundRatio,
      healthTrend,
      queuePressure,
      topReasons: topReasons(reasonCounts),
      lastCooldownReasons,
    },
    events,
    audits,
  });
}

function parsePayload(raw: string | null | undefined): any {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function topReasons(counts: Map<string, number>): ReasonCount[] {
  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function pickHealthTrend(input: {
  riskScore: number;
  spamFails24h: number;
  cooldowns24h: number;
  reconnects24h: number;
  queuePressure: number;
}): "green" | "yellow" | "red" {
  if (
    input.riskScore >= 75 ||
    input.spamFails24h >= 3 ||
    input.cooldowns24h >= 2 ||
    input.reconnects24h >= 5 ||
    input.queuePressure >= 0.95
  ) {
    return "red";
  }
  if (
    input.riskScore >= 40 ||
    input.spamFails24h > 0 ||
    input.cooldowns24h > 0 ||
    input.reconnects24h >= 3 ||
    input.queuePressure >= 0.7
  ) {
    return "yellow";
  }
  return "green";
}
