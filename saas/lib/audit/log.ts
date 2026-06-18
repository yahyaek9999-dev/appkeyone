/**
 * Audit-log emitter (Agent 5 — Enterprise & Security).
 *
 * Writes one append-only `AuditLog` row per sensitive action so owners/admins
 * can review "who on my team did what". Design contract:
 *   - BEST-EFFORT: never throws and never blocks the originating action. A
 *     failed audit write is logged and swallowed — it must not break a
 *     business mutation.
 *   - NO SECRETS: `metadata` is redacted before persistence — keys that look
 *     like secrets/tokens/keys are dropped, values are bounded.
 *   - ADDITIVE: if the `AuditLog` table does not exist yet (pre `db push`), the
 *     create fails silently and the app is unaffected.
 *
 * This is distinct from SafetyAudit (anti-ban) and WaComplianceAudit (messaging
 * policy) which remain untouched.
 */

import { prisma } from "@/lib/db";
import { getClientIp } from "@/lib/rate-limit";
import type { AuthContext } from "@/lib/auth";

/** Known action verbs. Free-form strings are allowed for forward-compat. */
export type AuditAction =
  | "team.member_invited"
  | "team.role_changed"
  | "team.member_removed"
  | "order.updated"
  | "order.deleted"
  | "broadcast.created"
  | "integration.connected"
  | "integration.updated"
  | "integration.deleted"
  | "integration.key_rotated"
  | "settings.ai_provider_changed"
  | "settings.meta_cloud_changed"
  | "settings.bot_updated"
  | "whatsapp.connected"
  | "whatsapp.disconnected"
  | "safety.kill_switch_cleared"
  | "admin.user_approved"
  | "admin.user_suspended"
  | "admin.user_deleted"
  | "admin.user_password_reset"
  | "admin.subscription_changed"
  | "admin.settings_changed"
  | "admin.plan_changed"
  | "admin.plan_archived"
  | "admin.plan_restored"
  | (string & {});

export interface AuditInput {
  /** Workspace owner id — the data scope for the row. Required. */
  userId: string;
  /** What happened. Use the dotted verbs above where possible. */
  action: AuditAction;
  /** The acting principal (User.id for owners, TeamMember.id for members). */
  actorId?: string | null;
  /** Acting principal's email at action time. */
  actorEmail?: string | null;
  /** Acting principal's effective role. */
  actorRole?: string | null;
  /** Object class acted upon, e.g. "order" | "member" | "integration". */
  targetType?: string | null;
  /** Object id acted upon. */
  targetId?: string | null;
  /** Extra context — REDACTED before storage. Never pass secrets. */
  metadata?: Record<string, unknown> | null;
  /** Explicit client IP, or pass `req` to derive it. */
  ip?: string | null;
  /** Request to derive IP from (x-forwarded-for / x-real-ip). */
  req?: Request | null;
}

const SECRET_KEY_RE =
  /(secret|token|password|passwd|apikey|api[_-]?key|authorization|auth|cookie|session|bearer|private|signature|hash|webhook[_-]?secret|\bkey\b)/i;
const MAX_STRING = 500;
const MAX_KEYS = 40;

/**
 * Recursively strip secret-looking keys and bound value sizes. Returns a plain
 * JSON-safe object. Depth-limited to avoid pathological inputs.
 */
function redact(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth > 4) return "[truncated]";
  if (typeof value === "string") {
    return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + "…" : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => redact(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (count >= MAX_KEYS) break;
      if (SECRET_KEY_RE.test(k)) {
        out[k] = "[redacted]";
      } else {
        out[k] = redact(v, depth + 1);
      }
      count++;
    }
    return out;
  }
  return String(value).slice(0, MAX_STRING);
}

/** Serialize redacted metadata, bounded so a row never balloons. */
function serializeMetadata(metadata: Record<string, unknown> | null | undefined): string {
  try {
    const json = JSON.stringify(redact(metadata ?? {}));
    return json.length > 4000 ? json.slice(0, 4000) : json;
  } catch {
    return "{}";
  }
}

/**
 * Emit one audit row. Best-effort — awaiting it is safe but optional; callers
 * typically fire-and-forget with `.catch(() => {})` or `void audit(...)`.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const ip =
      input.ip ?? (input.req ? safeIp(input.req) : null) ?? null;
    await (prisma as any).auditLog.create({
      data: {
        userId: input.userId,
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ? input.actorEmail.slice(0, 200) : null,
        actorRole: input.actorRole ?? "owner",
        action: String(input.action).slice(0, 80),
        targetType: input.targetType ? String(input.targetType).slice(0, 60) : null,
        targetId: input.targetId ? String(input.targetId).slice(0, 200) : null,
        metadata: serializeMetadata(input.metadata),
        ip: ip ? String(ip).slice(0, 64) : null,
      },
    });
  } catch (e: any) {
    // Never let auditing break a business action.
    console.warn("[audit] write failed:", e?.message || e);
  }
}

function safeIp(req: Request): string | null {
  try {
    return getClientIp(req);
  } catch {
    return null;
  }
}

/**
 * Convenience wrapper: derive actor fields from an AuthContext so call sites
 * stay one line. `ctx` may be null (e.g. internal callers) — then actor fields
 * are omitted and `userId` must be supplied via `over.userId`.
 */
export async function auditCtx(
  ctx: AuthContext | null,
  action: AuditAction,
  over: Partial<AuditInput> & { userId?: string } = {},
): Promise<void> {
  const userId = over.userId ?? ctx?.user.id;
  if (!userId) return; // nothing to scope to — skip silently
  await audit({
    userId,
    action,
    actorId: ctx ? (ctx.isOwner ? ctx.user.id : ctx.member?.id ?? null) : over.actorId ?? null,
    actorEmail: ctx?.principalEmail ?? over.actorEmail ?? null,
    actorRole: ctx?.role ?? over.actorRole ?? "owner",
    targetType: over.targetType ?? null,
    targetId: over.targetId ?? null,
    metadata: over.metadata ?? null,
    ip: over.ip ?? null,
    req: over.req ?? null,
  });
}
