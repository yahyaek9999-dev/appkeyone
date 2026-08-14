# WKEYONE — Master State Summary
**Generated:** 2026-08-14 — Session 4+5 (GAPS CLOSED)

---

## Architecture

| Layer | Reality |
|-------|---------|
| Runtime | Next.js 14 App Router, Prisma + PostgreSQL, AWS Linux eu-north-1 |
| Auth | JWT cookie `mse_session` — owner `{uid}` or team-member `{mid}` shape |
| WhatsApp | Customer-installed Bridge (bridge-node/keyone-wa-bridge.js) via Bridge Gateway |
| DB schema | 175 models, dual-schema (schema.prisma → schema.postgres.prisma via generate script) |
| Deploy | `deploy/release-aws.sh` — additive `prisma db push`, never destructive |
| Live URL | https://w.keyone1.com |

---

## Current Workspaces (dashboard)

8 workspaces, 38 routes:
- **Home**: Dashboard, My Work, Analytics, Command Center
- **Sales**: Orders, Products, Broadcasts Pro
- **Customers**: Customers, Inbox, Leads, Import
- **AI (ذكاء الأعمال)**: Bot, Knowledge, Brain, Revenue intel, Bot Builder, etc.
- **Growth**: Funnel, Segments, Recovery, Business
- **Ops**: Integrations, Automations, Branches, Approvals, WhatsApp Health
- **Data/Settings**: Wallet, Working Hours, Usage, Billing, Settings, Team, Profile, etc.

---

## Admin Control Center (already built)

Groups: Finances | Operations | Support | Technical | Settings  
~50 admin routes. Core routes:
- `/admin/plans` — plan limits + pricing
- `/admin/feature-control` — feature flags + kill switch
- `/admin/releases` — release lifecycle (hidden/beta/active/archived)
- `/admin/promotions` — 6 promotion types
- `/admin/commercial` — customer-specific overrides + gifts
- `/admin/payment-gateways` — encrypted gateway config
- `/admin/staff` — admin staff management
- `/admin/users` — customer subscriptions
- `/admin/system-health` — system status

---

## Membership System (COMPLETE — Session 5 closures applied)

**4 public tiers:** Start, Growth, Pro, Enterprise  
**Legacy (backward compat only):** k_business, k_scale  

**Entitlement engine** (5-layer, `lib/membership/entitlements.ts`):
1. Base Plan capabilities (capIndex)
2. CustomerPlanOverride (custom admin deal)
3. PromotionRedemption feature unlocks — **WIRED Session 5** (fetchActivePromoUnlocks)
4. EntitlementGift (one-time credits, unlocks, free days)
5. FeatureControl.killSwitch → always overrides — **WIRED Session 5** (getAllFeatures in Step 5)

**Limits returned by getEntitlements():**
team | automations | kbDocs | whatsapp | broadcasts | ai | messages | customers | smsCredits

---

## Feature Control System (COMPLETE)

`lib/feature-control.ts`:
- `isFeatureEnabled(featureId)` — recursive dependency resolution, cycle guard, max depth 20
- `featureBlockedBy(featureId)` — diagnostic: why is this off?
- `isFeatureVisible(featureId)` — customer nav visibility
- 30s cache, `invalidateFeatureCache()` on admin change
- Admin API: `GET/POST /api/admin/feature-control`, `PATCH /api/admin/feature-control/[id]`
- Admin UI: `/admin/feature-control`

---

## Bot Execution Engine (COMPLETE — Session 3)

`lib/bot/executor.ts`:
- 11 node types: start, message, buttons, question, condition, assign, handoff, delay, tag, sms, end
- ConvBotLock mutex (1-min TTL, expired lock stealing)
- Max depth 50, state persistence between messages
- 96/96 tests pass

---

## Inbox / Support Routing (COMPLETE — Session 3)

- Queue states: open | assigned | pending | resolved | closed
- SLA: slaDeadlineAt, slaBreached, slaMinsLeft (server-computed)
- Team routing: manual / round_robin / least_loaded
- Employee privacy: server-side filter via getAuthContext() → isMember

---

## Multi-WhatsApp Numbers (COMPLETE — Session 5)

**Models:** WhatsAppNumber, NumberSettings (per-number config), Conversation.numberId  
**API:** `/api/numbers` (GET/POST), `/api/numbers/[id]` (PATCH/DELETE), `/api/numbers/[id]/settings` (GET/PATCH)  
**UI:** `/dashboard/settings/numbers` (list + add), `/dashboard/settings/numbers/[id]` (5-tab config)  
**Plan gate:** `ents.limits.whatsapp` — 0=unlimited, N=max allowed  
**Nav:** "أرقام واتساب" entry added to Settings workspace

---

## Admin Staff Authentication (COMPLETE — Session 5)

**Schema:** `StaffMember.passwordHash`, `lastLoginAt`, `lastLoginIp`, `inviteToken`, `inviteExpiresAt`  
**API:** `POST /api/admin/staff-auth` (login), `?action=invite` (create invite), `?action=setup` (set password)  
**Cookie:** `mse_staff_session` (HS256 JWT, 8h TTL, path=/admin)  
**UI:** `/admin/login` (staff login form), `/admin/invite/[token]` (invite accept + password setup)  
**Auth flow:** Admin creates invite → email token to staff → staff visits `/admin/invite/TOKEN` → sets password → logs in at `/admin/login`

---

## Server-Side Usage Enforcement (COMPLETE — Session 5)

**Model:** `UsageEvent` (userId, eventType, quantity, idempotencyKey, period=YYYY-MM)  
**Library:** `lib/usage/enforce.ts` — `checkAndCharge()` (atomic, idempotent, fail-open), `getUsageSummary()`, `getPeriodUsage()`  
**API:** `GET /api/usage` — returns period usage + plan limits + tier  
**Event types:** message_out, message_in, ai_request, broadcast, sms, otp

---

## Number-Level Employee Access (COMPLETE — Session 5)

**Schema:** `TeamMember.allowedNumberIds` (JSON array of WhatsAppNumber.id; empty=all)  
**Enforcement:** inbox route (`/api/inbox/conversations`) checks `allowedNumberIds` — if non-empty, filters to `conversation.numberId IN allowedNumberIds`  
**Server-side only:** client cannot bypass this filter  

---

## Session 5 Additional Closures

| Gap | Closed |
|-----|--------|
| Promotions Layer 3 was missing | ✅ fetchActivePromoUnlocks() implemented |
| Kill switch never called from entitlements | ✅ getAllFeatures() in Step 5 |
| Admin layout ignored staff session | ✅ Path B: mse_staff_session decoded |
| NAV_CAP_BY_HREF missing numbers | ✅ /dashboard/settings/numbers → multi_whatsapp |
| Working hours TODO (null:null) | ✅ JSON parsed → today's slot |
| /api/usage always-zero | ✅ getUsageSummary merges UsageLedger |
| isFeatureEnabled never called | ✅ Wired to /api/numbers POST + entitlements |
| User.whatsAppNumbers relation missing | ✅ Reverse relation added to both schemas |

## REMAINING — ADVISORY ONLY

### Feature Control → Nav Visual Hiding (LOW PRIORITY)
**Current:** Nav gates by plan caps only (NAV_CAP_BY_HREF). Admin kill switch now blocks at API and entitlement level. Nav item may still be visible if enforce=false.
**Risk:** UX confusion only (user clicks → gets error from API; no data exposed).
**Fix if needed:** Pass `isFeatureEnabled()` to nav item rendering in dashboard layout.

---

## Production Risks (current)

| Risk | Severity | Status |
|------|----------|--------|
| Single WhatsApp number architecture | HIGH | ✅ CLOSED |
| Admin staff no individual login | HIGH | ✅ CLOSED |
| No usage enforcement | HIGH | ✅ CLOSED |
| Number-level employee access | HIGH | ✅ CLOSED |
| Promotions: no per-customer redemption rate limit | MEDIUM | Existing anti-abuse in place (rate limiter) |
| Nav shows killed features | LOW | Advisory — API blocks even if nav visible |
| Old "Business/Scale" plan names in DB | LOW | Data only — backward compat handled |

---

## Release Strategy

### Release 1 (PUBLIC LAUNCH — Ready Now)
1. WhatsApp Inbox + Bot + Auto-reply
2. Customer 360 (customers, orders, products)
3. Smart support routing + team inbox
4. Basic automations
5. K1SMS (transactional SMS, OTP, shipping notifications)
6. Shipping tracking
7. Business insights (basic analytics)
8. Multi-number capability per plan (after GAP 1 fix)
9. Employee/team access (after GAP 4 fix)

### Release 2 (After gap closure)
- Bot Builder (advanced flows)
- Advanced routing + escalation rules
- Campaign broadcasts (QR-based)
- Revenue intelligence

### Release 3 (Enterprise)
- Advanced analytics + BI
- Advanced integrations
- Custom enterprise controls
- White-label

---

## Legacy / Cleanup Notes

- `Business`/`Scale` plan tiers: kept in TIER_ORDER for backward compat, NOT in PUBLIC_TIERS. Safe.
- `/dashboard/broadcasts` (old): removed from nav, page reachable by URL. Superseded by broadcasts-pro.
- `/dashboard/flow-builder`: hidden (not production-ready). Bot-builder at /dashboard/bot-builder is the production version.
- `/dashboard/agents`: hidden, not production-ready.
- Arena/brain duplicates: consolidated in nav (pages still reachable by URL).
- Windows VPS: RETIRED. All docs updated.

---

## Implementation Checklist (Session 4+5)

- [x] Read all context files
- [x] Build master state summary
- [x] Schema: WhatsAppNumber + NumberSettings models
- [x] Schema: StaffMember auth fields (passwordHash, lastLoginAt, lastLoginIp, inviteToken, inviteExpiresAt)
- [x] Schema: TeamMember.allowedNumberIds + Conversation.numberId + UsageEvent model
- [x] generate-pg-schema.sh → 175 models
- [x] schema-parity.js verify → ✓ 175 models in lock-step
- [x] API: /api/numbers (GET list, POST create with plan gate)
- [x] API: /api/numbers/[id] (PATCH update, DELETE block-if-active)
- [x] API: /api/numbers/[id]/settings (GET/PATCH per-number settings)
- [x] API: /api/admin/staff-auth (login + invite + setup)
- [x] API: /api/usage (usage summary + plan limits)
- [x] lib/usage/enforce.ts (checkAndCharge, getUsageSummary, getPeriodUsage)
- [x] UI: /dashboard/settings/numbers (number management with plan limit warning)
- [x] UI: /dashboard/settings/numbers/[id] (5-tab per-number settings)
- [x] UI: /admin/login (staff login form)
- [x] UI: /admin/invite/[token] (invite accept + password setup)
- [x] Nav: "أرقام واتساب" added to Settings workspace
- [x] Inbox route: allowedNumberIds enforcement (server-side number-level access)
- [x] Typecheck → 0 errors
- [x] Build → 184 pages, 0 errors
- [x] Tests → 96/96 PASS
