/**
 * lib/finance/access.ts — Finance Operations access control.
 *
 * A "finance" operator is a platform User whose User.role is "finance" (created
 * by the owner from /admin/users). They get an owner-session for their own
 * account; the role grants access to the Finance area (payment review) WITHOUT
 * full platform-admin power. Platform admins (User.role "admin") are always
 * allowed too. This is a recognized RBAC gate (see scripts/verify/rbac-coverage).
 */
import { getAuthContext } from "@/lib/auth";

export const FINANCE_ROLES = ["admin", "finance"] as const;

/** Throws UNAUTHORIZED/FORBIDDEN unless the caller is a platform admin or finance user. */
export async function requireFinanceOrAdmin() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("UNAUTHORIZED");
  const role = (ctx.user as any)?.role;
  if (!ctx.isOwner || !(role === "admin" || role === "finance")) throw new Error("FORBIDDEN");
  return ctx.user;
}

/** Non-throwing variant: returns the finance/admin user or null. */
export async function getFinanceActor() {
  try {
    return await requireFinanceOrAdmin();
  } catch {
    return null;
  }
}
