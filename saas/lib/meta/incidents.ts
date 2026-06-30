/**
 * Meta Enterprise — incident center.
 *
 * Incidents are raised by the health engine (or manually) and are idempotent
 * per (userId, dedupeKey) while OPEN, so a recurring condition doesn't spam
 * duplicates. The health engine auto-resolves an incident when its condition
 * clears. Every state change appends to the JSON timeline.
 */

import { prisma } from "@/lib/db";
import { auditMeta } from "./tenant";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "acknowledged" | "resolved" | "auto_resolved";

function pushTimeline(existing: string, event: Record<string, unknown>): string {
  let arr: unknown[] = [];
  try {
    arr = JSON.parse(existing || "[]");
  } catch {
    arr = [];
  }
  arr.push(event);
  return JSON.stringify(arr.slice(-50));
}

/** Open an incident idempotently. If an OPEN/ACK incident with the same
 *  (userId, dedupeKey) exists, return it unchanged. */
export async function openIncident(input: {
  userId?: string | null;
  type: string;
  dedupeKey: string;
  title: string;
  detail?: string;
  severity?: IncidentSeverity;
  priority?: string;
}) {
  const existing = await prisma.metaIncident.findFirst({
    where: {
      userId: input.userId ?? null,
      dedupeKey: input.dedupeKey,
      status: { in: ["open", "acknowledged"] },
    },
  });
  if (existing) return { incident: existing, created: false as const };
  const incident = await prisma.metaIncident.create({
    data: {
      userId: input.userId ?? null,
      type: input.type,
      dedupeKey: input.dedupeKey,
      title: input.title,
      detail: input.detail ?? "",
      severity: input.severity ?? "medium",
      priority: input.priority ?? "normal",
      status: "open",
      timeline: JSON.stringify([{ at: new Date().toISOString(), event: "opened" }]),
    },
  });
  return { incident, created: true as const };
}

/** Auto-resolve open incidents for (userId, dedupeKey) — the condition cleared. */
export async function autoResolveByKey(userId: string | null, dedupeKey: string): Promise<number> {
  const open = await prisma.metaIncident.findMany({
    where: { userId: userId ?? null, dedupeKey, status: { in: ["open", "acknowledged"] } },
  });
  for (const i of open) {
    await prisma.metaIncident.update({
      where: { id: i.id },
      data: {
        status: "auto_resolved",
        autoFixed: true,
        resolvedAt: new Date(),
        timeline: pushTimeline(i.timeline, {
          at: new Date().toISOString(),
          event: "auto_resolved",
        }),
      },
    });
  }
  return open.length;
}

export async function resolveIncident(id: string, resolvedBy: string, note?: string) {
  const inc = await prisma.metaIncident.findUnique({ where: { id } });
  if (!inc) return { ok: false as const, reason: "not_found" };
  if (inc.status === "resolved" || inc.status === "auto_resolved")
    return { ok: false as const, reason: "already_resolved" };
  const incident = await prisma.metaIncident.update({
    where: { id },
    data: {
      status: "resolved",
      resolvedBy,
      resolvedAt: new Date(),
      timeline: pushTimeline(inc.timeline, {
        at: new Date().toISOString(),
        event: "resolved",
        by: resolvedBy,
        note,
      }),
    },
  });
  await auditMeta({
    userId: inc.userId,
    actorId: resolvedBy,
    actorRole: "admin",
    action: "incident_resolved",
    target: id,
    note: note ?? null,
  });
  return { ok: true as const, incident };
}

export async function acknowledgeIncident(id: string, by: string) {
  const inc = await prisma.metaIncident.findUnique({ where: { id } });
  if (!inc) return { ok: false as const, reason: "not_found" };
  const incident = await prisma.metaIncident.update({
    where: { id },
    data: {
      status: "acknowledged",
      owner: by,
      timeline: pushTimeline(inc.timeline, {
        at: new Date().toISOString(),
        event: "acknowledged",
        by,
      }),
    },
  });
  return { ok: true as const, incident };
}

export async function escalateIncident(id: string, by: string) {
  const inc = await prisma.metaIncident.findUnique({ where: { id } });
  if (!inc) return { ok: false as const, reason: "not_found" };
  const next: IncidentSeverity =
    inc.severity === "low" ? "medium" : inc.severity === "medium" ? "high" : "critical";
  const incident = await prisma.metaIncident.update({
    where: { id },
    data: {
      severity: next,
      escalated: true,
      priority: "urgent",
      timeline: pushTimeline(inc.timeline, {
        at: new Date().toISOString(),
        event: "escalated",
        by,
        severity: next,
      }),
    },
  });
  await auditMeta({
    userId: inc.userId,
    actorId: by,
    actorRole: "admin",
    action: "incident_escalated",
    target: id,
    after: { severity: next },
  });
  return { ok: true as const, incident };
}

export async function listIncidents(
  opts: { userId?: string; status?: string; take?: number } = {},
) {
  return prisma.metaIncident.findMany({
    where: {
      ...(opts.userId ? { userId: opts.userId } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    },
    orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }],
    take: opts.take ?? 100,
  });
}
