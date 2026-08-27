/**
 * Team isolation — the resolver that makes `conversationScope` and
 * `allowedNumberIds` mean something.
 *
 * Both columns existed on TeamMember before this module: declared, read in one
 * place (allowedNumberIds, in the inbox list) or nowhere at all
 * (conversationScope), and written by NOTHING. There was no API, no script and
 * no screen that could set either one, so every member in production sat on the
 * default forever. That is what made `multi_team` unsellable — the isolation
 * primitives were real but unreachable.
 *
 * PRECEDENCE — narrowest configured wins, and "unconfigured" always falls back
 * to the historical behaviour:
 *
 *   1. member override   TeamMember.conversationScope / .allowedNumberIds
 *   2. team policy       Team.conversationScope / .allowedNumberIds
 *   3. historical default  own_only, all numbers
 *
 * Rule 3 is the non-regression guarantee. Every member row that exists today
 * has teamId = null and an empty override, so it resolves to exactly the
 * `assignedStaffId = me` + no-number-filter behaviour the inbox already
 * enforced. Widening a member's view is only ever the result of an owner
 * explicitly putting them on a team or setting an override.
 */

import { prisma } from "@/lib/db";

export type ConversationScope = "own_only" | "team" | "all";

export const CONVERSATION_SCOPES: ConversationScope[] = ["own_only", "team", "all"];

/** The scope a member falls back to when neither they nor their team set one. */
export const DEFAULT_SCOPE: ConversationScope = "own_only";

export function isConversationScope(v: unknown): v is ConversationScope {
  return typeof v === "string" && (CONVERSATION_SCOPES as string[]).includes(v);
}

/** Parse an allowedNumberIds JSON column. Anything malformed = unrestricted. */
export function parseNumberIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
  } catch {
    return [];
  }
}

export interface MemberScopeInput {
  conversationScope: string | null | undefined;
  allowedNumberIds: string | null | undefined;
  team: {
    id: string;
    name: string;
    conversationScope: string | null | undefined;
    allowedNumberIds: string | null | undefined;
  } | null;
}

export interface ResolvedScope {
  scope: ConversationScope;
  /** Empty array = every number in the workspace. */
  allowedNumberIds: string[];
  teamId: string | null;
  teamName: string | null;
  /** Which layer decided the scope — surfaced in the UI so it is never a mystery. */
  scopeSource: "member" | "team" | "default";
  numbersSource: "member" | "team" | "default";
}

/**
 * Pure resolution of the precedence rule. Exported separately from the DB read
 * so it is testable without a database and so callers that already hold the row
 * (the inbox does) don't pay for a second query.
 */
export function resolveScope(m: MemberScopeInput): ResolvedScope {
  let scope: ConversationScope = DEFAULT_SCOPE;
  let scopeSource: ResolvedScope["scopeSource"] = "default";
  if (isConversationScope(m.conversationScope)) {
    scope = m.conversationScope;
    scopeSource = "member";
  } else if (m.team && isConversationScope(m.team.conversationScope)) {
    scope = m.team.conversationScope;
    scopeSource = "team";
  }

  let allowedNumberIds = parseNumberIds(m.allowedNumberIds);
  let numbersSource: ResolvedScope["numbersSource"] = allowedNumberIds.length ? "member" : "default";
  if (!allowedNumberIds.length && m.team) {
    const fromTeam = parseNumberIds(m.team.allowedNumberIds);
    if (fromTeam.length) {
      allowedNumberIds = fromTeam;
      numbersSource = "team";
    }
  }

  return {
    scope,
    allowedNumberIds,
    teamId: m.team?.id ?? null,
    teamName: m.team?.name ?? null,
    scopeSource,
    numbersSource,
  };
}

/**
 * Resolve the isolation for one member, reading the member + their team.
 * Returns the historical default when the member row is missing or the read
 * fails — never widen access because of an error on this path.
 */
export async function resolveMemberScope(memberId: string): Promise<ResolvedScope> {
  const fallback: ResolvedScope = {
    scope: DEFAULT_SCOPE,
    allowedNumberIds: [],
    teamId: null,
    teamName: null,
    scopeSource: "default",
    numbersSource: "default",
  };
  try {
    const row = await (prisma as any).teamMember.findUnique({
      where: { id: memberId },
      select: {
        conversationScope: true,
        allowedNumberIds: true,
        team: { select: { id: true, name: true, conversationScope: true, allowedNumberIds: true } },
      },
    });
    if (!row) return fallback;
    return resolveScope(row as MemberScopeInput);
  } catch {
    return fallback;
  }
}

/**
 * The set of TeamMember ids whose conversations `memberId` may read, or null
 * when the resolved scope puts no assignee restriction on them at all.
 *
 *   own_only → [memberId]
 *   team     → every ACTIVE member of the same team (including themselves);
 *              a member with `team` scope but no team is still just themselves,
 *              because "my team" of one person is that person.
 *   all      → null (no assignee filter)
 */
export async function assigneeScopeIds(
  memberId: string,
  resolved: ResolvedScope,
): Promise<string[] | null> {
  if (resolved.scope === "all") return null;
  if (resolved.scope === "own_only" || !resolved.teamId) return [memberId];
  try {
    const peers = await (prisma as any).teamMember.findMany({
      where: { teamId: resolved.teamId },
      select: { id: true },
    });
    const ids = peers.map((p: { id: string }) => p.id);
    return ids.includes(memberId) ? ids : [...ids, memberId];
  } catch {
    // Fail closed to the narrowest scope rather than exposing the workspace.
    return [memberId];
  }
}
