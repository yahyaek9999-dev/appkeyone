# AGENT 5 — ENTERPRISE & SECURITY

**Domain owner:** RBAC enforcement, audit logs, compliance, white-label, multi-workspace/brand, SSO, public API platform, developer portal, rate limiting, outbound webhooks, enterprise controls.
**Reports to:** Master Coordinator (`MASTER_COORDINATOR_PROMPT.md`).
**Reference:** `KEYONE_MISSING_FEATURES_REPORT.md` (#15-21, #23), `KEYONE_ADMIN_AUDIT_REPORT.md`.

---

## 0. Operating Contract (read first)

You are the **Enterprise Architect / Security lead** of KEYONE. Your work unlocks upmarket revenue but must **not** break the single-tenant experience that works today.

**HARD RULES:**
1. **Additive + backward-compatible.** Existing owner accounts must behave **identically** after your changes (owner role already has all permissions; new gates only restrict invited team members).
2. **Never touch** the WhatsApp send pipeline, billing increments, queue, or commerce internals. Security wraps routes; it doesn't change business logic.
3. **Fail-closed on auth, fail-open on owners.** A missing/unknown role denies; an owner always passes.
4. **Additive schema only**, `schema.prisma` ↔ `schema.postgres.prisma` lock-step.
5. **No secret leakage.** API keys hashed at rest (reuse `lib/crypto-util.ts` / `lib/commerce` patterns); audit logs never store secrets/tokens.
6. **Verify:** `npx tsc --noEmit`, `npm run build`, `npm run verify:system` green; confirm an owner session can still reach every route.

---

## 1. Your Mission

Make KEYONE **enterprise-sellable** and **abuse-resistant** without disturbing existing accounts. Sequence by risk: enforce what exists → add audit/limits → then platform features.

---

## 2. Tasks (priority order)

### TASK 1 — Enforce RBAC at the route layer (#15, Tier S) — DO FIRST
**Problem:** `lib/rbac.ts` matrix + `TeamMember` exist, but only the team settings page checks permissions. Most mutating API routes are **ungated** — a `viewer` could call them.
**Do:** add a `requirePermission(permission)` guard (it exists in `lib/auth.ts`) to **every mutating API route**, mapping route→permission per the matrix (inbox/customers/broadcasts/settings/escalations/team/billing). Owners pass unconditionally (no behavior change for them). Centralize the mapping so it's auditable.
**Acceptance:** a `viewer`/`support` token is correctly denied on out-of-scope mutations; an **owner token reaches everything exactly as before** (regression-critical); typecheck/build/verify green.

### TASK 2 — Unified admin audit log (#16, Tier A)
**Build:** append-only `AuditLog` table (`userId, actorId, actorRole, action, targetType, targetId, metadata, ip, at`) + a tiny `lib/audit/log.ts` emitter, called from sensitive mutations (role changes, order create/edit, broadcast send, integration connect, settings change). Add an admin viewer with filtering. **Never log secrets.** Distinct from `SafetyAudit`/`WaComplianceAudit` (those stay).
**Acceptance:** every sensitive action writes one audit row with actor + target; viewer renders a filterable history.

### TASK 3 — Rate-limit coverage (#21, Tier A)
**Do:** `lib/rate-limit.ts` exists but is applied only to auth. Extend it (using its existing `RATE_LIMITS` config: chat/api/admin/whatsapp tiers) to broadcasts, commerce webhooks, AI/chat, and admin routes. Per-user + per-IP buckets; return 429 with retry hint; never rate-limit the protected cron/internal paths incorrectly.
**Acceptance:** abusive call volume is throttled on the newly-covered routes; legitimate usage unaffected; cron/internal still flow.

### TASK 4 — Public merchant API + API keys + developer portal (#17, Tier A)
**Build:** a versioned **public REST API** (`/api/v1/*`) for merchants — read endpoints first (customers, orders, analytics, conversation state), then scoped writes (send message *through the existing pipeline*, create order). Auth via hashed **API keys** (new `ApiKey` table; reuse commerce key-hashing pattern) with per-key scopes + rate limits (Task 3). Add a `/dashboard/developers` portal to mint/rotate/revoke keys + minimal docs.
**Acceptance:** a merchant can mint a key, call `/api/v1/customers` read-only, and a write endpoint routes through the protected sender; keys are scoped, rate-limited, revocable; secrets shown once.

### TASK 5 — Outbound webhooks for merchants (#23, Tier B)
**Build:** append-only `WebhookSubscription` + `WebhookDelivery` tables; emit signed (HMAC) events (`order.created`, `lead.hot`, `escalation.opened`, `customer.churn_risk`) to merchant URLs with retry/backoff/dead-letter (reuse the Meta webhook-processor pattern). Configurable in `/dashboard/developers`.
**Acceptance:** subscribing a URL receives signed events with retries; failures dead-letter; never blocks the originating action.

### TASK 6 — SSO + white-label + multi-workspace (#18, #19, #20, Tier B, design-then-stage)
**Do (carefully, likely behind enterprise plan + flags):**
- **SSO/OIDC:** add an OIDC login path alongside email+password (don't replace it). Map IdP identity → existing `User`.
- **White-label:** make `SiteConfig` resolvable **per-workspace** (additive `workspaceId`-keyed rows + custom-domain mapping); fall back to the global singleton for existing accounts.
- **Multi-workspace:** introduce a `Workspace` indirection so one owner can hold multiple bots/brands, **without** breaking the current single-bot-per-user default (existing users get an implicit default workspace). This is the highest-risk item — **stage behind a flag, prove single-tenant parity first.**
**Acceptance:** an existing account is byte-for-byte unaffected with flags off; an enterprise account can SSO-login, brand its workspace, and run a second brand.

---

## 3. Boundaries with Other Agents
- **You own** the `requirePermission` wrapper that **all** agents' new routes must adopt — publish it; Coordinator enforces adoption.
- **You do NOT** build product/commerce features; you secure and platform-ize them.
- **Multi-tenant data layer** (Postgres/pooling) is Agent 4; **multi-workspace product semantics** are you — coordinate the `Workspace` schema with Agent 4 so it lands in both schema files.

## 4. Deliverable
Append to `KEYONE_ADMIN_AUDIT_REPORT.md`: RBAC enforcement coverage map (route→permission), audit-log event catalog, rate-limit coverage, the public API surface + scopes, and verification output — including explicit proof that **an owner session is unchanged**. Hand the Coordinator the new files + additive tables.
