import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { type Role, type Permission, can, normalizeRole } from "./rbac";

/**
 * Resolve the JWT signing secret. In production a missing/weak AUTH_SECRET is a
 * fatal misconfiguration: falling back to a public dev string would let anyone
 * forge `mse_session` cookies and take over any account. Fail closed instead.
 * In non-production we keep the documented dev fallback for DX.
 */
function resolveAuthSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AUTH_SECRET must be set to a strong value (>= 32 chars) in production"
      );
    }
    return new TextEncoder().encode("dev-secret-please-change-min-32-chars-long");
  }
  return new TextEncoder().encode(s);
}

const SECRET = resolveAuthSecret();
const COOKIE = "mse_session";
const ALG = "HS256";
const SECURE_COOKIE = process.env.NODE_ENV === "production";

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

/** Owner session — token payload `{ uid }`. Unchanged from the original. */
export async function createSession(userId: string) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
  // Next 15: cookies() is async — await the store before mutating it.
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE_COOKIE,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** Team-member session — token payload `{ mid }` (the TeamMember.id). */
export async function createMemberSession(memberId: string) {
  const token = await new SignJWT({ mid: memberId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
  // Next 15: cookies() is async — await the store before mutating it.
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE_COOKIE,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

// Next 15: cookies() is async, so clearing a cookie must await the store.
// Now async — callers must `await clearSession()`.
export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE);
}

/** Decode the session cookie. Returns the raw payload or null. */
async function readToken(): Promise<{ uid?: string; mid?: string } | null> {
  const store = await cookies();
  const tok = store.get(COOKIE)?.value;
  if (!tok) return null;
  try {
    const { payload } = await jwtVerify(tok, SECRET);
    return payload as { uid?: string; mid?: string };
  } catch {
    return null;
  }
}

/**
 * Legacy helper kept for any caller that only needs the owner User.id. For
 * member sessions this returns the OWNER's id (so existing `where:{userId}`
 * scoping is unchanged).
 */
export async function getUserId(): Promise<string | null> {
  const ctx = await getAuthContext();
  return ctx?.user.id ?? null;
}

type OwnerUser = NonNullable<Awaited<ReturnType<typeof loadOwner>>>;

function loadOwner(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { bot: true, subscription: { include: { plan: true } } },
  });
}

export interface AuthContext {
  /** The OWNER User row — what all data queries scope to. */
  user: OwnerUser;
  /** Effective role of the authenticated principal. */
  role: Role;
  /** True when the principal is the workspace owner (not a team member). */
  isOwner: boolean;
  /** The TeamMember row when the principal is a team member; else null. */
  member: { id: string; email: string; role: string; name: string | null } | null;
  /** Email of the actual logged-in principal (owner or member). */
  principalEmail: string;
}

/**
 * Resolve the full auth context from the session cookie.
 *   - `{ uid }`  → owner session: role "owner", isOwner true.
 *   - `{ mid }`  → member session: must be status "active"; role = member.role;
 *                  `user` is the OWNER row so all scoping keeps working.
 * Returns null when unauthenticated or the principal is no longer valid.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const payload = await readToken();
  if (!payload) return null;

  // Owner session
  if (payload.uid) {
    const user = await loadOwner(payload.uid);
    if (!user) return null;
    return {
      user,
      role: "owner",
      isOwner: true,
      member: null,
      principalEmail: user.email,
    };
  }

  // Member session
  if (payload.mid) {
    const member = await prisma.teamMember.findUnique({ where: { id: payload.mid } });
    if (!member || member.status !== "active") return null;
    const owner = await loadOwner(member.ownerId);
    if (!owner) return null;
    return {
      user: owner,
      role: normalizeRole(member.role),
      isOwner: false,
      member: { id: member.id, email: member.email, role: member.role, name: member.name },
      principalEmail: member.email,
    };
  }

  return null;
}

/**
 * Backward-compatible: returns the OWNER User (with bot + subscription) for the
 * current session, whether the principal is the owner or a team member. Callers
 * that need the role/principal should use getAuthContext().
 */
export async function getCurrentUser() {
  const ctx = await getAuthContext();
  return ctx?.user ?? null;
}

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/**
 * Require the current principal to hold `permission`. Returns the OWNER User
 * (drop-in replacement for requireUser) so route bodies are unchanged. Owners
 * always pass. Throws "UNAUTHORIZED" (no session) or "FORBIDDEN" (no perm).
 */
export async function requirePermission(permission: Permission) {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("UNAUTHORIZED");
  if (!can(ctx.role, permission)) throw new Error("FORBIDDEN");
  return ctx.user;
}

/**
 * Permission-aware variant of getUserId(). Returns the OWNER's User.id when the
 * current principal holds `permission`, else null. Lets routes that use the
 * `getUserId()` → `if (!uid) 401` pattern enforce RBAC with a one-line swap:
 * a member lacking the permission is treated as unauthenticated (no data leak).
 */
export async function getUserIdForPermission(permission: Permission): Promise<string | null> {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  if (!can(ctx.role, permission)) return null;
  return ctx.user.id;
}

/**
 * Like getCurrentUser() but returns the OWNER User only when the principal
 * holds `permission`; otherwise null. For routes using the
 * `getCurrentUser()` → `if (!user) 401` pattern.
 */
export async function getUserForPermission(permission: Permission) {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  if (!can(ctx.role, permission)) return null;
  return ctx.user;
}

/**
 * Server-component page guard. Redirects to /login when unauthenticated and to
 * /dashboard when the principal lacks `permission`. Returns the AuthContext so
 * pages can read role/owner/member. Use at the top of sensitive pages.
 */
export async function requirePagePermission(permission: Permission): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, permission)) redirect("/dashboard");
  return ctx;
}

/**
 * Map an error thrown by requireUser()/requirePermission() to an HTTP status.
 * UNAUTHORIZED → 401, FORBIDDEN → 403, anything else → 500. Lets route catch
 * blocks return the correct code without leaking a 403 as a 500.
 */
export function authErrorStatus(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "UNAUTHORIZED") return 401;
  if (msg === "FORBIDDEN") return 403;
  return 500;
}
