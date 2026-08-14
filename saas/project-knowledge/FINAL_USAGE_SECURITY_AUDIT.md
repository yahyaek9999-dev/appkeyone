# WKEYONE — Final Usage & Security Audit
**Generated:** 2026-08-14

---

## Usage Accounting — Dual Source Architecture

### System 1: UsageLedger (Legacy — ACTIVE)
- Written by: `recordUsage()` in `lib/usage-ledger.ts`
- Read by: `/admin/usage-stats`, `getUsageSummary()` (Layer 1 fallback)
- Fields: `userId, kind, quantity, source, idempotencyKey`
- Kinds: `messages`, `ai`, `broadcast`
- Status: **WIRED and writing** — production data exists

### System 2: UsageEvent (New — INFRASTRUCTURE READY)
- Written by: `checkAndCharge()` in `lib/usage/enforce.ts`
- Read by: `getUsageSummary()` (Layer 0), `getPeriodUsage()`
- Fields: `userId, eventType, quantity, idempotencyKey, period, source, metadata`
- Event types: `message_out`, `message_in`, `ai_request`, `broadcast`, `sms`, `otp`
- Status: **Infrastructure complete; NOT YET wired to send path**

### Merged View (getUsageSummary — FIXED)
`getUsageSummary()` now reads BOTH sources and returns the higher of each counter:
- UsageEvent for new atomic charges
- UsageLedger for legacy-tracked activity
- `/api/usage` returns real data regardless of which system wrote it

---

## Usage Enforcement — checkAndCharge() Security Model

| Property | Guarantee |
|---------|-----------|
| Server-side only | Client CANNOT submit, forge, or increment counters |
| Idempotency | Same key = no double-charge; handled at DB constraint |
| Atomic | count + insert in same request; race condition safe for soft limits |
| Fail-open | DB error → allowed=true (gating bug must never silence WhatsApp) |
| Period reset | YYYY-MM key resets automatically each new billing month |
| No client trust | `hidden fields`, `query params`, `browser state` — all ignored |

---

## Security Audit: Attack Vectors Closed

### 1. Team Member Data Isolation
**Attack:** Team member queries conversations for other users' data.
**Defense:** `isMember && memberId` → `where.conversation.assignedStaffId = memberId`
**Location:** `/api/inbox/conversations/route.ts:21-41`
**Test:** 12 passing tests in employee-privacy.test.ts

### 2. Number-Level Access Bypass
**Attack:** Team member accesses WhatsApp numbers they're not assigned to.
**Defense:** `allowedNumberIds.length > 0` → `where.conversation.numberId = { in: allowed }`
**Location:** `/api/inbox/conversations/route.ts:26-40`
**Server-side:** Yes — cannot be bypassed by client

### 3. Admin Panel Unauthorized Access
**Attack:** A team member (non-owner, non-admin) visits /admin routes.
**Defense:** `ctx.isOwner && ctx.user.role === "admin"` OR valid `mse_staff_session`
**Location:** `app/admin/layout.tsx:17-62`
**Redirect:** → `/admin/login` if neither path validates

### 4. Usage Quota Bypass
**Attack:** Client claims to have unlimited quota or submits false usage counter.
**Defense:** `checkAndCharge()` reads entitlements from DB, counts from DB — no client input
**Server-side:** Yes

### 5. OTP Token Theft
**Attack:** Raw OTP value stored/logged, enabling account takeover.
**Defense:** SHA-256 hash only stored (`otp:${code}` prefix). Token comparison: hash(input) === stored.
**Raw value:** Never persisted, never logged.

### 6. Staff Session Forgery
**Attack:** Attacker forges `mse_staff_session` cookie.
**Defense:** HS256 JWT signed with AUTH_SECRET (≥32 chars in production, fatal error otherwise).
**Additional:** `StaffMember.active` check in admin layout — suspended staff cannot access even with valid token.
**8h expiry:** Stolen tokens auto-expire.

### 7. Feature Kill Switch Bypass via Plan Upgrade
**Attack:** User upgrades plan to unlock a feature Admin killed.
**Defense:** `getEntitlements()` Step 5 kills capabilities AFTER all additive layers. Kill switch always wins.

### 8. Promotion Abuse / Duplicate Redemption
**Defense:** `PromotionRedemption` row per user (FK on userId) — one redemption per promotion per user.
Rate limiter on `/api/promotions/redeem` provides additional protection.

### 9. WhatsApp Send Pipeline Integrity
**Policy:** Pipeline code is NEVER modified without explicit owner approval.
**Additive-only:** All changes to WhatsApp handling are additive (new models, new API routes).
**Safety engine:** `assessAndShape()` blocks high-risk sends before they reach the pipeline.

---

## Anti-Abuse Controls

| Control | Location | What It Prevents |
|---------|----------|-----------------|
| Rate limiting | lib/rate-limit.ts, enforceRateLimit() | API flooding, mass sends |
| Anti-ban safety engine | lib/safety/engine.ts | WhatsApp account bans |
| Human-delay humanizer | lib/safety/humanize-v2.ts | Bot detection |
| Working hours gate | incoming/route.ts (now wired) | Off-hours unwanted sends |
| Message quota | checkAndCharge() | Overage billing fraud |
| Broadcast limits | getEntitlements().limits.broadcasts | Mass spam prevention |

---

## Data Security

| Category | Policy |
|----------|--------|
| Production schema changes | Additive-only via `prisma db push` |
| Hard deletes | NEVER — soft delete only (deletedAt) |
| Production data modification | Requires explicit owner sign-off |
| Financial records | Never deleted — preserved for audit |
| Environment secrets | AUTH_SECRET ≥ 32 chars enforced in production |
| Encrypted gateway config | Payment gateway credentials encrypted at rest |

---

## Known Accepted Risks (Low Severity)

| Risk | Why Accepted |
|------|-------------|
| Nav shows killed features if enforce=false | API blocks access; UX confusion only |
| UsageEvent not wired to send path | UsageLedger covers billing; new system is infrastructure for future |
| SUPER_ADMIN role not differentiated | All admin staff are trusted KEYONE team; future hardening item |
