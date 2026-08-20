/**
 * Central, auditable map of mutating API routes → required RBAC permission.
 *
 * This file is the SINGLE SOURCE OF TRUTH for "which permission gates which
 * route". It is intentionally data-only (no imports, no side effects) so it can
 * be diffed, reviewed, and snapshot-tested without pulling in the app runtime.
 *
 * HOW ENFORCEMENT ACTUALLY WORKS
 * ------------------------------
 * Each route handler enforces its gate inline by calling one of the auth
 * helpers in `lib/auth.ts` with the permission listed here:
 *   - requirePermission(permission)        → throws UNAUTHORIZED / FORBIDDEN
 *   - getUserIdForPermission(permission)    → returns null (treated as 401)
 *   - getUserForPermission(permission)      → returns null (treated as 401)
 * Owners (and platform admins via their owner session) ALWAYS pass — the
 * permission matrix in `lib/rbac.ts` grants `owner` every permission. New gates
 * therefore only ever restrict invited team members; existing owner accounts
 * behave identically.
 *
 * This map is NOT auto-wired into a middleware (the App Router runs route
 * handlers in the Node runtime where Prisma lives; a global middleware can't do
 * DB-backed role resolution on the edge). Instead it documents the intended
 * gate per route and powers the coverage audit in
 * `scripts/verify/rbac-coverage.js`, which fails CI if a mutating route under
 * `app/api` is missing both a gate call and an explicit waiver below.
 *
 * Keep this list in lock-step with the handlers. When you add a mutating route,
 * add it here too (or to PUBLIC_OR_INTERNAL_ROUTES with a reason).
 */

import type { Permission } from "./rbac";

/** A route path (relative to `app/`, no leading slash) → the permission it needs. */
export type RoutePermissionEntry = {
  /** Route path as it appears on disk, e.g. "api/orders/[id]/route.ts". */
  route: string;
  /** Permission required to MUTATE (POST/PUT/PATCH/DELETE) on this route. */
  permission: Permission;
  /** Optional note for the audit (why this permission, edge cases). */
  note?: string;
};

/**
 * Mutating routes and the permission they require. Read-only GET handlers on
 * the same route are generally allowed for any authenticated principal that can
 * see the surrounding feature; the permission below is the bar for WRITES.
 */
export const ROUTE_PERMISSIONS: RoutePermissionEntry[] = [
  // ---- Inbox & conversations ----
  { route: "api/inbox/conversation/[customerId]/send/route.ts", permission: "inbox" },
  { route: "api/inbox/conversation/[customerId]/notes/route.ts", permission: "inbox" },
  { route: "api/inbox/conversation/[customerId]/internal-notes/route.ts", permission: "inbox" },
  { route: "api/inbox/conversation/[customerId]/pause/route.ts", permission: "inbox" },
  { route: "api/inbox/conversation/[customerId]/suggest-reply/route.ts", permission: "inbox" },
  { route: "api/chat/route.ts", permission: "inbox", note: "merchant-side AI chat / playground send" },

  // ---- Escalations ----
  { route: "api/escalations/route.ts", permission: "escalations" },
  { route: "api/escalations/[id]/route.ts", permission: "escalations" },

  // ---- Customers & CRM ----
  { route: "api/customers/[id]/route.ts", permission: "customers" },
  { route: "api/customers/[id]/crm/route.ts", permission: "customers" },

  // ---- Orders ----
  { route: "api/orders/route.ts", permission: "customers" },
  { route: "api/orders/[id]/route.ts", permission: "customers" },

  // ---- Broadcasts & recovery (bulk messaging) ----
  { route: "api/broadcasts/route.ts", permission: "broadcasts" },
  { route: "api/broadcasts/[id]/route.ts", permission: "broadcasts" },
  { route: "api/broadcasts/ab/route.ts", permission: "broadcasts" },
  { route: "api/broadcasts/generate/route.ts", permission: "broadcasts" },
  { route: "api/broadcasts/optimize/route.ts", permission: "broadcasts" },
  { route: "api/recovery/action/route.ts", permission: "broadcasts" },

  // ---- Settings: bot, knowledge, products, coupons, integrations, providers ----
  { route: "api/bot/route.ts", permission: "settings" },
  { route: "api/knowledge/route.ts", permission: "settings" },
  { route: "api/knowledge/[id]/route.ts", permission: "settings" },
  { route: "api/knowledge/import-file/route.ts", permission: "settings" },
  { route: "api/knowledge/import-url/route.ts", permission: "settings" },
  { route: "api/knowledge/import-products/route.ts", permission: "settings" },
  { route: "api/knowledge-gaps/[id]/route.ts", permission: "settings" },
  { route: "api/products/route.ts", permission: "settings" },
  { route: "api/products/[id]/route.ts", permission: "settings" },
  { route: "api/quick-replies/route.ts", permission: "settings" },
  { route: "api/quick-replies/[id]/route.ts", permission: "settings" },
  { route: "api/coupons/route.ts", permission: "settings" },
  { route: "api/coupons/[id]/route.ts", permission: "settings" },
  { route: "api/coupons/[id]/redeem/route.ts", permission: "settings" },
  { route: "api/working-hours/route.ts", permission: "settings" },
  { route: "api/flows/route.ts", permission: "settings", note: "premium Flow Builder writes; apiGate also checks entitlement" },
  { route: "api/flows/[id]/route.ts", permission: "settings", note: "premium Flow Builder writes; apiGate also checks entitlement" },
  { route: "api/branches/route.ts", permission: "settings", note: "premium branch management writes; apiGate also checks entitlement" },
  { route: "api/branches/[id]/route.ts", permission: "settings", note: "premium branch management writes; apiGate also checks entitlement" },
  { route: "api/white-label/route.ts", permission: "settings", note: "premium branding writes; apiGate also checks entitlement" },
  { route: "api/settings/ai-provider/route.ts", permission: "settings" },
  { route: "api/settings/ai-provider/test/route.ts", permission: "settings" },
  { route: "api/settings/meta-cloud/route.ts", permission: "settings" },
  { route: "api/settings/orders/route.ts", permission: "settings", note: "order-settings (auto-confirm, etc.) writes" },
  { route: "api/automations/rules/route.ts", permission: "settings", note: "premium automation rules; apiGate also checks advanced_automations" },
  { route: "api/commerce/integrations/route.ts", permission: "settings" },
  { route: "api/commerce/integrations/[id]/route.ts", permission: "settings" },
  { route: "api/commerce/integrations/[id]/rotate/route.ts", permission: "settings" },
  { route: "api/commerce/integrations/[id]/sync/route.ts", permission: "settings" },
  { route: "api/commerce/integrations/[id]/test/route.ts", permission: "settings" },
  { route: "api/commerce/automations/route.ts", permission: "settings" },
  { route: "api/commerce/notifications/route.ts", permission: "settings" },
  { route: "api/commerce/events/retry/route.ts", permission: "settings" },
  { route: "api/commerce/email-provider/route.ts", permission: "settings" },
  { route: "api/onboarding/setup/route.ts", permission: "settings", note: "writes bot + products + knowledge" },
  { route: "api/whatsapp/start/route.ts", permission: "settings", note: "connect WhatsApp session" },
  { route: "api/whatsapp/pair/route.ts", permission: "settings", note: "pair WhatsApp via code" },
  { route: "api/whatsapp/logout/route.ts", permission: "settings", note: "disconnect WhatsApp session" },
  { route: "api/safety/clear-kill/route.ts", permission: "settings", note: "clears the safety kill-switch" },

  // ---- Team management ----
  { route: "api/settings/team/route.ts", permission: "team" },
  { route: "api/approvals/route.ts", permission: "team", note: "approval workflow creation/review for owner/admin roles" },
  { route: "api/approvals/[id]/route.ts", permission: "team", note: "approval decisions/deletes for owner/admin roles" },

  // ---- Billing / upgrades ----
  { route: "api/upgrade-request/route.ts", permission: "billing", note: "owner-only self-serve upgrade request mutation" },

  // ---- Data export ----
  { route: "api/export/route.ts", permission: "analytics", note: "per-export-type gate inside handler" },
];

/**
 * Routes that intentionally have NO RBAC gate, each with an explicit reason.
 * The coverage audit treats these as waived so it can fail loudly on anything
 * NOT listed here and NOT carrying a gate call.
 */
export const PUBLIC_OR_INTERNAL_ROUTES: { route: string; reason: string }[] = [
  { route: "api/auth/login/route.ts", reason: "public — establishes a session" },
  { route: "api/auth/signup/route.ts", reason: "public — self-service signup" },
  { route: "api/auth/logout/route.ts", reason: "public — clears the session cookie" },
  { route: "api/auth/accept-invite/route.ts", reason: "public — token-authenticated invite accept" },
  { route: "api/auth/forgot-password/route.ts", reason: "public — no session exists yet; rate-limited (RATE_LIMITS.auth)" },
  { route: "api/auth/reset-password/route.ts", reason: "public — token-authenticated password reset; rate-limited (RATE_LIMITS.auth)" },
  { route: "api/health/route.ts", reason: "public liveness probe" },
  { route: "api/ready/route.ts", reason: "public readiness probe" },
  { route: "api/commerce/webhooks/route.ts", reason: "HMAC-signed third-party webhook (no session)" },
  { route: "api/whatsapp/meta-webhook/route.ts", reason: "Meta-signed webhook (X-Hub-Signature-256)" },
  { route: "api/payments/webhook/paymob/route.ts", reason: "Paymob HMAC-SHA512 signed payment webhook (no session)" },
  { route: "api/payments/webhook/stripe/route.ts", reason: "Stripe-Signature HMAC-SHA256 signed payment webhook (no session)" },
  { route: "api/whatsapp/incoming/route.ts", reason: "internal-secret guarded inbound processor" },
  { route: "api/whatsapp/status/route.ts", reason: "authenticated read of own bot status" },
  { route: "api/cron/ai-catalog-guard/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/broadcasts/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/daily-report/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/follow-ups/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/llm-prewarm/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/meta-quality-monitor/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/meta-template-sync/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/meta-webhook-processor/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/outgoing-messages/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/payments-reconcile/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/meta/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/meta-cost/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/trial-expiry/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/qr-queue/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/qr-scheduler/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/credits-monthly/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/brain-credits-monthly/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/brain-learning/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/incident-scan/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/abandoned-cart/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/automations/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/catalog-sync/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/product-affinity/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/cron/provider-maintenance/route.ts", reason: "x-internal-secret guarded cron" },
  { route: "api/internal/metrics/route.ts", reason: "x-internal-secret guarded ops endpoint" },
  { route: "api/internal/queue-health/route.ts", reason: "x-internal-secret guarded ops endpoint" },
  { route: "api/internal/wa-health/route.ts", reason: "x-internal-secret guarded ops endpoint" },
  { route: "api/bridge/v1/device/start/route.ts", reason: "public — RFC 8628 device grant start; Bridge has no account yet, rate-limited" },
  { route: "api/bridge/v1/device/token/route.ts", reason: "public — RFC 8628 device grant poll; PKCE-proven + one-time consumed, rate-limited" },
  { route: "api/bridge/v1/token/rotate/route.ts", reason: "Bearer bridge_token authenticated (no session); reuse-detected rotation, rate-limited" },
  { route: "api/numbers/route.ts", reason: "getAuthContext owner-only guard; WhatsApp number creation with feature/plan gating inside handler" },
  { route: "api/numbers/[id]/route.ts", reason: "getAuthContext owner-only guard; WhatsApp number update/delete for owner's numbers only" },
  { route: "api/numbers/[id]/settings/route.ts", reason: "getAuthContext owner-only guard; WhatsApp number settings mutations" },
  { route: "api/sms/credits/route.ts", reason: "getAuthContext owner-only guard; SMS credit purchases for account owner" },
];

/** Admin routes are guarded by `requireAdmin()` (owner + platform-admin role). */
export const ADMIN_ROUTE_PREFIX = "api/admin/";

/** Lookup the required permission for a given route path, or undefined. */
export function permissionForRoute(route: string): Permission | undefined {
  return ROUTE_PERMISSIONS.find((e) => e.route === route)?.permission;
}
