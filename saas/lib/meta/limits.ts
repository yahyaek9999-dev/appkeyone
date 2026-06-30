/**
 * Meta Enterprise — limit engine.
 *
 * Every limited dimension (conversation / daily / weekly / monthly / budget /
 * cost / country / template / phone / campaign / queue / automation) is a row in
 * MetaLimit, scoped at one of four layers. Resolution precedence (highest wins):
 *
 *   emergency  >  tenant  >  plan  >  global
 *
 * value = -1 means unlimited. A dimension with no enabled row anywhere is
 * unlimited by default (additive: existing tenants are unaffected).
 */

import { prisma } from "@/lib/db";

export const META_LIMIT_KINDS = [
  "conversation",
  "daily",
  "weekly",
  "monthly",
  "budget",
  "cost",
  "country",
  "template",
  "phone",
  "campaign",
  "queue",
  "automation",
] as const;
export type MetaLimitKind = (typeof META_LIMIT_KINDS)[number];
export type MetaLimitScope = "global" | "plan" | "tenant" | "emergency";

/** Default global limits (-1 = unlimited). Admin tunes per scope afterwards. */
const DEFAULT_GLOBAL_LIMITS: Array<{ kind: MetaLimitKind; value: number; unit: string }> = [
  { kind: "daily", value: -1, unit: "count" },
  { kind: "monthly", value: -1, unit: "count" },
  { kind: "budget", value: -1, unit: "egp" },
  { kind: "phone", value: 10, unit: "count" },
];

/** Idempotently ensure default global limits exist. */
export async function ensureDefaultLimits(): Promise<number> {
  let created = 0;
  for (const l of DEFAULT_GLOBAL_LIMITS) {
    const existing = await prisma.metaLimit.findUnique({
      where: { scope_scopeRef_kind: { scope: "global", scopeRef: "*", kind: l.kind } },
    });
    if (!existing) {
      await prisma.metaLimit.create({
        data: { scope: "global", scopeRef: "*", kind: l.kind, value: l.value, unit: l.unit },
      });
      created++;
    }
  }
  return created;
}

export interface EffectiveLimit {
  kind: MetaLimitKind;
  value: number; // -1 = unlimited
  unit: string;
  scope: MetaLimitScope;
}

/** Resolve the effective limit for a dimension, honoring precedence. Returns
 *  null when no enabled limit is configured (= unlimited). */
export async function resolveLimit(
  kind: MetaLimitKind,
  ctx: { userId?: string | null; planSlug?: string | null },
): Promise<EffectiveLimit | null> {
  const candidates: Array<{ scope: MetaLimitScope; scopeRef: string }> = [
    { scope: "emergency", scopeRef: "*" },
  ];
  if (ctx.userId) candidates.push({ scope: "tenant", scopeRef: ctx.userId });
  if (ctx.planSlug) candidates.push({ scope: "plan", scopeRef: ctx.planSlug });
  candidates.push({ scope: "global", scopeRef: "*" });

  for (const c of candidates) {
    const row = await prisma.metaLimit.findUnique({
      where: { scope_scopeRef_kind: { scope: c.scope, scopeRef: c.scopeRef, kind } },
    });
    if (row && row.enabled) {
      return { kind, value: row.value, unit: row.unit, scope: c.scope };
    }
  }
  return null;
}

export interface LimitCheck {
  allowed: boolean;
  limit: number; // -1 = unlimited
  remaining: number; // -1 = unlimited
  scope: MetaLimitScope | null;
}

/** Check whether `currentUsage` is within the effective limit for a dimension. */
export async function checkLimit(
  kind: MetaLimitKind,
  currentUsage: number,
  ctx: { userId?: string | null; planSlug?: string | null },
): Promise<LimitCheck> {
  const eff = await resolveLimit(kind, ctx);
  if (!eff || eff.value < 0) {
    return { allowed: true, limit: -1, remaining: -1, scope: eff?.scope ?? null };
  }
  const remaining = Math.max(0, eff.value - currentUsage);
  return { allowed: currentUsage < eff.value, limit: eff.value, remaining, scope: eff.scope };
}

/** Upsert a single limit row (admin/tenant override). */
export async function setLimit(input: {
  scope: MetaLimitScope;
  scopeRef?: string | null;
  kind: MetaLimitKind;
  value: number;
  unit?: string;
  enabled?: boolean;
  note?: string | null;
  userId?: string | null; // set for tenant scope to enable cascade + relation
}) {
  const scopeRef =
    input.scope === "tenant" ? input.scopeRef || input.userId || "*" : input.scopeRef || "*";
  return prisma.metaLimit.upsert({
    where: { scope_scopeRef_kind: { scope: input.scope, scopeRef, kind: input.kind } },
    create: {
      scope: input.scope,
      scopeRef,
      kind: input.kind,
      value: input.value,
      unit: input.unit ?? "count",
      enabled: input.enabled ?? true,
      note: input.note ?? null,
      userId: input.scope === "tenant" ? (input.userId ?? scopeRef) : null,
    },
    update: {
      value: input.value,
      ...(input.unit ? { unit: input.unit } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
  });
}
