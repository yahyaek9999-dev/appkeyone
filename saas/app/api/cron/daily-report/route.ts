// Daily AI Business Report — cron endpoint.
//
// Triggered by a scheduled task on the VPS once per hour. For every active
// merchant whose `dailyReportHour` matches the current UTC hour and who
// hasn't already been sent today, builds a heuristic-only Arabic report and
// delivers it via the merchant's own WhatsApp gateway (to notifyPhone /
// whatsappPhone / user.phone, in that order of preference).
//
// Auth: same internal-secret pattern as the other cron endpoints.
// Behavior: zero LLM calls. No customer-facing fan-out. Idempotent within
// a calendar day via `dailyReportLastSentAt`.
//
// Query params:
//   ?dryRun=1     — generate the report text but do not send (returns it).
//   ?userId=...   — restrict to a single merchant (debug / preview).
//   ?force=1      — ignore the hour-of-day match and the daily dedupe.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { wa } from "@/lib/wa";
import { aggregateForUser } from "@/lib/daily-report/aggregate";
import { deriveInsights } from "@/lib/daily-report/insights";
import { formatReport } from "@/lib/daily-report/format-ar";
import { localHour, localYmd } from "@/lib/tz";
import {
  drainDailyReportRetries,
  queueDailyReportDelivery,
  sendDailyReportDelivery,
} from "@/lib/daily-report/delivery";
import { buildDailyUsageSnapshot } from "@/lib/usage-ledger";

export const dynamic = "force-dynamic";

const SECRET =
  process.env.SAAS_INTERNAL_SECRET || "dev-internal-secret-change-me";

export async function POST(req: Request) {
  if (req.headers.get("x-internal-secret") !== SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const force = url.searchParams.get("force") === "1";
  const onlyUserId = url.searchParams.get("userId") || null;

  const now = new Date();
  const retryStats = await drainDailyReportRetries(25);

  // Pull all merchants with a Bot configured. We filter by hour + dedupe in
  // JS rather than in Prisma so the query stays simple and indexable.
  const where: any = onlyUserId ? { id: onlyUserId } : {};
  // include the full bot row so we get the new `timezone` field without a
  // typed select (Prisma client types may not include it until regen).
  const users = (await prisma.user.findMany({
    where,
    include: { bot: true, subscription: { include: { plan: false } } } as any,
  })) as any[];

  const out: any[] = [];
  let sent = 0,
    skipped = 0,
    failed = 0;

  for (const u of users) {
    const bot = u.bot;
    if (!bot) {
      skipped++;
      out.push({ userId: u.id, skip: "no-bot" });
      continue;
    }

    // The merchant configured a local hour-of-day (e.g. 9 AM). We compare
    // against the *local* hour in their own timezone, and dedupe by their
    // local calendar day. This way a Cairo merchant gets 9 AM Cairo even
    // when the VPS runs UTC.
    const tz = (bot.timezone as string | undefined) || "Africa/Cairo";
    const localH = localHour(tz, now);
    const localDayKey = localYmd(tz, now);

    if (!force) {
      if (!bot.dailyReportEnabled) {
        skipped++;
        out.push({ userId: u.id, skip: "disabled" });
        continue;
      }
      // Hour window: match exact hour OR the NEXT hour if we haven't sent
      // today (covers cron drift / a missed tick at the top of the hour).
      // This means a 9 AM configured report will fire at the first cron tick
      // between 09:00–09:59 local OR the first one after 10:00 if 9 was missed.
      const configuredHour = bot.dailyReportHour ?? 9;
      const alreadySentToday =
        bot.dailyReportLastSentAt &&
        localYmd(tz, bot.dailyReportLastSentAt) === localDayKey;
      const hourMatches = localH === configuredHour;
      const catchupAfter =
        localH > configuredHour &&
        localH <= configuredHour + 2 &&
        !alreadySentToday;
      if (!hourMatches && !catchupAfter) {
        skipped++;
        out.push({
          userId: u.id,
          skip: `hour-mismatch:${configuredHour}!=${localH}(${tz})`,
        });
        continue;
      }
      if (alreadySentToday) {
        skipped++;
        out.push({ userId: u.id, skip: "already-sent-today" });
        continue;
      }
    }

    const sub = u.subscription;
    if (!force && (!sub || sub.status !== "active" || sub.expiresAt < now)) {
      skipped++;
      out.push({ userId: u.id, skip: "no-active-sub" });
      continue;
    }

    const to = bot.notifyPhone || bot.whatsappPhone || u.phone || null;
    if (!to) {
      skipped++;
      out.push({ userId: u.id, skip: "no-phone" });
      continue;
    }

    // WhatsApp status is a "best effort" health signal — sometimes the wa-service
    // marks a session "connecting" for short windows even though it can still
    // send. Don't block the report on it; if the send itself fails we'll catch
    // it below and log a SafetyAudit row.
    if (!force && bot.whatsappStatus === "disconnected") {
      skipped++;
      out.push({ userId: u.id, skip: `wa-status:disconnected` });
      continue;
    }

    try {
      const agg = await aggregateForUser(u.id, now);
      const insights = deriveInsights(agg);
      const report = formatReport({
        shopName: bot.name || "متجرك",
        agg,
        insights,
      });

      if (!report.shouldSend) {
        skipped++;
        out.push({ userId: u.id, skip: "quiet-day" });
        continue;
      }

      if (dryRun) {
        out.push({ userId: u.id, dryRun: true, to, preview: report.text });
        continue;
      }

      const delivery = await queueDailyReportDelivery({
        userId: u.id,
        reportDay: localDayKey,
        channel: "whatsapp",
        recipient: to,
        body: report.text,
      });
      const r = await sendDailyReportDelivery(delivery);
      if (r?.ok) {
        await prisma.bot
          .update({
            where: { userId: u.id },
            data: { dailyReportLastSentAt: now } as any,
          })
          .catch(() => {});
        sent++;
        out.push({
          userId: u.id,
          to,
          status: "sent",
          tz,
          localHour: localH,
          localDay: localDayKey,
          insights: report.used.map((x: any) => x.id),
        });
        console.log(
          `[daily-report] ✓ sent userId=${u.id} tz=${tz} localHour=${localH} to=${to}`,
        );
      } else {
        failed++;
        const errStr = String(
          (r as any)?.error || "daily_report_send_failed",
        ).slice(0, 400);
        await prisma.safetyAudit
          .create({
            data: {
              userId: u.id,
              level: "warn",
              category: "daily_report",
              title: "فشل إرسال التقرير اليومي",
              detail: errStr,
              payload: JSON.stringify({ to, tz, localHour: localH }),
            },
          })
          .catch(() => {});
        out.push({ userId: u.id, to, status: "send-failed", error: errStr });
      }
      buildDailyUsageSnapshot(u.id, localDayKey).catch(() => {});
    } catch (e: any) {
      failed++;
      await prisma.safetyAudit
        .create({
          data: {
            userId: u.id,
            level: "warn",
            category: "daily_report",
            title: "خطأ أثناء توليد التقرير اليومي",
            detail: String(e?.message || e).slice(0, 400),
            payload: JSON.stringify({ tz, localHour: localH }),
          },
        })
        .catch(() => {});
      out.push({ userId: u.id, error: e?.message || String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    nowUtc: now.toISOString(),
    examined: users.length,
    sent,
    skipped,
    failed,
    dryRun,
    retries: retryStats,
    log: out,
  });
}
