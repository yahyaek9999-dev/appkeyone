import { prisma } from "@/lib/db";

function safeJson(value: unknown): string {
  try { return JSON.stringify(value || {}); } catch { return "{}"; }
}

export async function logProtectionEvent(args: {
  userId: string;
  customerId?: string | null;
  phone?: string | null;
  kind: string;
  action: string;
  severity?: "info" | "warn" | "critical";
  score?: number;
  reason?: string;
  payload?: Record<string, unknown>;
}) {
  await (prisma as any).protectionLog.create({
    data: {
      userId: args.userId,
      customerId: args.customerId || null,
      phone: args.phone || null,
      kind: args.kind,
      action: args.action,
      severity: args.severity || "info",
      score: args.score || 0,
      reason: args.reason || "",
      payload: safeJson(args.payload),
    },
  }).catch(() => {});
}

export async function evaluateInboundProtection(args: {
  userId: string;
  customerId: string;
  phone: string;
  text: string;
}) {
  const activeBan = await (prisma as any).banEvent.findFirst({
    where: { userId: args.userId, OR: [{ customerId: args.customerId }, { phone: args.phone }], status: "active" },
    select: { id: true, reason: true },
  }).catch(() => null);
  if (activeBan) {
    await logProtectionEvent({ userId: args.userId, customerId: args.customerId, phone: args.phone, kind: "ban", action: "blocked", severity: "warn", reason: activeBan.reason });
    return { blocked: true, reason: "customer_banned", score: 100 };
  }

  const since1m = new Date(Date.now() - 60_000);
  const since10m = new Date(Date.now() - 10 * 60_000);
  const [count1m, recent] = await Promise.all([
    prisma.message.count({ where: { role: "user", createdAt: { gte: since1m }, conversation: { customerId: args.customerId } } }).catch(() => 0),
    prisma.message.findMany({
      where: { role: "user", createdAt: { gte: since10m }, conversation: { customerId: args.customerId } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { content: true },
    }).catch(() => []),
  ]);

  const normalized = String(args.text || "").trim().toLowerCase();
  const repeated = recent.filter((m) => String(m.content || "").trim().toLowerCase() === normalized).length;
  let score = 0;
  const reasons: string[] = [];
  if (count1m >= 20) { score += 70; reasons.push("inbound_flood_20_per_min"); }
  else if (count1m >= 10) { score += 35; reasons.push("inbound_burst_10_per_min"); }
  if (repeated >= 5) { score += 35; reasons.push("repeated_identical_messages"); }
  if (args.text.length >= 3900) { score += 20; reasons.push("max_length_payload"); }

  if (score >= 80) {
    await logProtectionEvent({ userId: args.userId, customerId: args.customerId, phone: args.phone, kind: "flood", action: "blocked", severity: "critical", score, reason: reasons.join(","), payload: { count1m, repeated } });
    return { blocked: true, reason: reasons[0] || "flood", score };
  }
  if (score >= 35) {
    await logProtectionEvent({ userId: args.userId, customerId: args.customerId, phone: args.phone, kind: "suspicious", action: "observed", severity: "warn", score, reason: reasons.join(","), payload: { count1m, repeated } });
  }
  return { blocked: false, reason: reasons.join(","), score };
}

export async function banCustomer(args: { userId: string; customerId?: string | null; phone?: string | null; reason: string; severity?: string }) {
  const row = await (prisma as any).banEvent.create({
    data: { userId: args.userId, customerId: args.customerId || null, phone: args.phone || null, reason: args.reason, severity: args.severity || "warn" },
  });
  await logProtectionEvent({ userId: args.userId, customerId: args.customerId, phone: args.phone, kind: "ban", action: "banned", severity: "warn", reason: args.reason });
  return row;
}
