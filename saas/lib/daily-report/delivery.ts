import { prisma } from "@/lib/db";
import { wa } from "@/lib/wa";
import { sendCommerceEmail } from "@/lib/commerce/email";
import { usageIdempotencyKey } from "@/lib/usage-ledger";

function errText(value: unknown): string {
  return value instanceof Error ? value.message : typeof value === "string" ? value : JSON.stringify(value || {}).slice(0, 500);
}

export async function queueDailyReportDelivery(args: {
  userId: string;
  reportDay: string;
  channel: "whatsapp" | "email" | "dashboard";
  recipient: string;
  body: string;
}) {
  const idempotencyKey = usageIdempotencyKey(["daily-report", args.userId, args.reportDay, args.channel, args.recipient]);
  return (prisma as any).dailyReportDelivery.upsert({
    where: { idempotencyKey },
    create: {
      userId: args.userId,
      reportDay: args.reportDay,
      channel: args.channel,
      recipient: args.recipient,
      body: args.body,
      status: "queued",
      idempotencyKey,
    },
    update: { body: args.body, status: "queued", error: null },
  }).catch(() => null);
}

export async function sendDailyReportDelivery(row: any) {
  if (!row) return { ok: false, error: "missing_row" };
  await (prisma as any).dailyReportDelivery.update({ where: { id: row.id }, data: { status: "sending", attempts: { increment: 1 } } }).catch(() => {});
  try {
    let ok = false;
    let provider = row.channel;
    let error = "";
    if (row.channel === "whatsapp") {
      const r = await wa.send(row.userId, row.recipient, row.body, "system");
      ok = !!r.ok;
      error = ok ? "" : errText((r as any).data);
    } else if (row.channel === "email") {
      const r = await sendCommerceEmail({ userId: row.userId, to: row.recipient, subject: "تقرير KEYONE اليومي", html: `<div dir="rtl"><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(row.body)}</pre></div>`, text: row.body });
      ok = r.ok;
      provider = r.provider;
      error = r.error || "";
    } else {
      ok = true;
    }

    if (ok) {
      await (prisma as any).dailyReportDelivery.update({ where: { id: row.id }, data: { status: "sent", sentAt: new Date(), error: null } }).catch(() => {});
      return { ok: true, provider };
    }
    const nextAttemptAt = new Date(Date.now() + Math.min(6, (row.attempts || 0) + 1) * 30 * 60 * 1000);
    await (prisma as any).dailyReportDelivery.update({ where: { id: row.id }, data: { status: "failed", error: error.slice(0, 500), nextAttemptAt } }).catch(() => {});
    return { ok: false, provider, error };
  } catch (e: any) {
    const error = errText(e);
    await (prisma as any).dailyReportDelivery.update({ where: { id: row.id }, data: { status: "failed", error, nextAttemptAt: new Date(Date.now() + 30 * 60 * 1000) } }).catch(() => {});
    return { ok: false, error };
  }
}

export async function drainDailyReportRetries(limit = 30) {
  const rows = await (prisma as any).dailyReportDelivery.findMany({
    where: { status: "failed", attempts: { lt: 3 }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  }).catch(() => []);
  let sent = 0, failed = 0;
  for (const row of rows) {
    const r = await sendDailyReportDelivery(row);
    if (r.ok) sent++; else failed++;
  }
  return { examined: rows.length, sent, failed };
}

function escapeHtml(s: string): string {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
