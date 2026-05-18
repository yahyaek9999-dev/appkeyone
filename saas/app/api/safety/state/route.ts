// GET  /api/safety/state           — current safety snapshot for the user
// POST /api/safety/clear-kill      — admin clears the kill switch
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadState } from "@/lib/safety/store";
import { getStageLimits } from "@/lib/safety/warmup";

export async function GET() {
  const user = await requireUser();
  const state = await loadState(user.id);
  const limits = getStageLimits(state.warmupStage as any);

  // Recent events (last 24h, capped at 200) for the live feed.
  const since = new Date(Date.now() - 24 * 3_600_000);
  const events = await prisma.safetyEvent.findMany({
    where: { userId: user.id, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const audits = await prisma.safetyAudit.findMany({
    where: { userId: user.id, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Aggregate counts for chart cards
  const sends24h = events.filter((e: any) => e.kind === "send").length;
  const failures24h = events.filter((e: any) => e.kind === "failure").length;
  const cooldowns24h = events.filter((e: any) => e.kind === "cooldown").length;
  const reconnects24h = events.filter((e: any) => e.kind === "reconnect").length;
  const inbound24h = events.filter((e: any) => e.kind === "reply").length;

  // Failure split (spam-like vs technical) — informs the dashboard whether
  // recent failures are a real ban-risk signal or just infra hiccups.
  let spamFails24h = 0;
  let techFails24h = 0;
  let softenedCount = 0;
  const reasonCounts = new Map<string, number>();
  let lastCooldownReasons: string[] = [];
  for (const e of events as any[]) {
    let p: any = null;
    try { p = JSON.parse(e.payload || "{}"); } catch {}
    if (e.kind === "failure") {
      if (p?.kind === "spam" || p?.kind === "blocked" || p?.kind === "rate_limit") spamFails24h++;
      else techFails24h++;
    }
    if (e.kind === "cooldown" && p?.reasons && Array.isArray(p.reasons)) {
      if (lastCooldownReasons.length === 0) lastCooldownReasons = p.reasons.slice(0, 6);
      for (const r of p.reasons) reasonCounts.set(r, (reasonCounts.get(r) || 0) + 1);
    }
    if (e.kind === "send" && p?.reasons && Array.isArray(p.reasons)) {
      if (p.reasons.includes("cooldown_softened_for_inbound")) softenedCount++;
    }
  }
  const topReasons = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  const outboundInboundRatio = inbound24h > 0
    ? Number((sends24h / inbound24h).toFixed(2))
    : sends24h > 0 ? sends24h : 0;

  // Account-health trend: simple traffic-light. Green = healthy, Yellow =
  // recent friction, Red = clear ban-risk signals in last 24h.
  let healthTrend: "green" | "yellow" | "red" = "green";
  if (state.killSwitchActive || spamFails24h >= 8 || cooldowns24h >= 3) healthTrend = "red";
  else if (state.riskScore >= 50 || spamFails24h >= 3 || cooldowns24h >= 1 || reconnects24h >= 4) healthTrend = "yellow";

  // Queue pressure: 0..1 — how close we are to the daily/hourly ceiling.
  const queuePressure = Math.max(
    state.dailySends / Math.max(1, limits.maxDaily),
    state.hourlySends / Math.max(1, limits.maxHourly)
  );

  return NextResponse.json({
    state: {
      warmupStage: state.warmupStage,
      warmupReplyOnly: state.warmupReplyOnly,
      warmupStartedAt: state.warmupStartedAt,
      dailySends: state.dailySends,
      hourlySends: state.hourlySends,
      riskScore: state.riskScore,
      trustScore: state.trustScore,
      cooldownUntil: state.cooldownUntil,
      cooldownRemainingMs: state.cooldownUntil
        ? Math.max(0, new Date(state.cooldownUntil).getTime() - Date.now())
        : 0,
      killSwitchActive: state.killSwitchActive,
      killSwitchReason: state.killSwitchReason,
      killSwitchAt: state.killSwitchAt,
      recentFailures: state.recentFailures,
      recentReconnects: state.recentReconnects,
      totalSends: state.totalSends,
      totalFailures: state.totalFailures,
      totalCooldowns: state.totalCooldowns,
      lastSendAt: state.lastSendAt,
    },
    limits: {
      stage: limits.stage,
      maxDaily: limits.maxDaily,
      maxHourly: limits.maxHourly,
      maxNewChats10Min: limits.maxNewChats10Min,
      replyOnly: limits.replyOnly,
      description: limits.description,
    },
    counters: {
      sends24h, failures24h, cooldowns24h, reconnects24h,
      inbound24h, spamFails24h, techFails24h, softenedCount,
    },
    diagnostics: {
      outboundInboundRatio,
      healthTrend,
      queuePressure: Number(queuePressure.toFixed(2)),
      topReasons,
      lastCooldownReasons,
    },
    events: events.map((e: any) => ({
      id: e.id, kind: e.kind, phone: e.phone,
      riskScore: e.riskScore, createdAt: e.createdAt,
      payload: e.payload,
    })),
    audits: audits.map((a: any) => ({
      id: a.id, level: a.level, category: a.category,
      title: a.title, detail: a.detail, createdAt: a.createdAt,
    })),
  });
}
