/**
 * RBAC: roles + permission matrix for workspace team members.
 *
 * Single source of truth for "what can this role do". Mirrors the permission
 * matrix shown to owners in the team settings UI. The OWNER role always has
 * every permission — so adding these gates is a no-op for existing accounts
 * (every legacy logged-in principal resolves to `owner`). New enforcement only
 * ever restricts invited team members.
 */

export type Role = "owner" | "admin" | "sales" | "support" | "viewer";

/** Roles that can be assigned to an invited team member (owner is implicit). */
export const ASSIGNABLE_ROLES = ["admin", "sales", "support", "viewer"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export type Permission =
  | "analytics"   // view stats / reports / dashboards (everyone)
  | "inbox"       // inbox & conversations
  | "escalations" // escalation queue / handoff
  | "customers"   // customers + orders (CRM)
  | "broadcasts"  // bulk messaging
  | "settings"    // bot settings, knowledge, integrations, products, coupons...
  | "team"        // manage team members
  | "billing";    // subscription / billing (owner-only)

const ALL: Permission[] = [
  "analytics", "inbox", "escalations", "customers", "broadcasts", "settings", "team", "billing",
];

export const PERMISSIONS: Record<Role, Permission[]> = {
  owner: ALL,
  // Admin: everything except billing (which stays owner-only).
  admin: ["analytics", "inbox", "escalations", "customers", "broadcasts", "settings", "team"],
  sales: ["analytics", "inbox", "customers", "broadcasts"],
  support: ["analytics", "inbox", "escalations"],
  viewer: ["analytics"],
};

/** True if `role` is allowed to perform `permission`. Unknown roles → deny. */
export function can(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  const perms = PERMISSIONS[role as Role];
  return Array.isArray(perms) && perms.includes(permission);
}

/** Normalize an arbitrary string to a known Role, defaulting to "viewer". */
export function normalizeRole(role: string | null | undefined): Role {
  if (role && role in PERMISSIONS) return role as Role;
  return "viewer";
}
