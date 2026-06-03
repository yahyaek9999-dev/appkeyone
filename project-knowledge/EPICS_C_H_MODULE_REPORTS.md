# KEYONE — Epics C–H: Module Reports

**Date:** 2026-06-03
**Status:** ✅ Implemented (additive only — no rewrite of stable systems)

---

## Epic C — Team Roles & Permissions

### What was built

**New files:**
- `app/dashboard/settings/team/page.tsx` — server component, loads team members from `Bot.teamMembersJson`
- `app/dashboard/settings/team/team-settings-ui.tsx` — client UI with roles matrix, invite form, member list
- `app/api/settings/team/route.ts` — GET/PUT endpoints to read/write team roster

**Schema change (additive):**
- `Bot.teamMembersJson String @default("[]")` — JSON array of `{email, role, addedAt}` per team member

**Settings page** (`app/dashboard/settings/page.tsx`) — added "إدارة الفريق والأدوار" link card

### Roles defined

| Role | Label | Permissions |
|------|-------|-------------|
| owner | المالك | Everything (always the account owner) |
| admin | مدير | Everything except billing/account deletion |
| sales | مبيعات | Inbox, customers, orders, broadcasts |
| support | دعم | Inbox and escalations only |
| viewer | مشاهد | Read-only stats |

### Phase 2 note (shown to users)
The page displays an amber note explaining that login enforcement per team member is coming in the next phase. Phase 1 registers the roster; Phase 2 wires authentication.

---

## Epic D — Export Center

### What was built

**New files:**
- `app/dashboard/export/page.tsx` — server component with counts
- `app/dashboard/export/export-ui.tsx` — client download UI
- `app/api/export/route.ts` — CSV export endpoint with UTF-8 BOM

**Nav:** "تصدير البيانات" added to sidebar

### Export types (all CSV, UTF-8 BOM for Arabic Excel compatibility)

| Type | Columns | Row limit |
|------|---------|-----------|
| Customers | Name, phone, lead score, tags, last activity, added date | 10,000 |
| Orders | Order ID, customer name, phone, status, total, payment method, tracking code, date | 10,000 |
| Broadcasts | Title, audience, status, sent, failed, total, created date | 5,000 |
| Conversations | Customer, phone, role, message, intent, sentiment, timestamp | 50,000 |

---

## Epic E — Commerce Automation Builder

### What was built

**New files:**
- `app/dashboard/automations/page.tsx`
- `app/dashboard/automations/automation-builder-ui.tsx`

**Nav:** "أتمتة التجارة" added to sidebar

### Features
- Lists all `CommerceAutomation` rules grouped by event type
- Toggle rules on/off inline
- Edit modal: message template, email subject, throttle seconds
- Create modal: pick trigger event + channel, pre-fills default templates
- Default Arabic templates for key events (order.created, shipped, delivered, etc.)
- Variable reference shown: `{customerName} {orderId} {trackingCode} {brandName}`

### API used
Existing `/api/commerce/automations` (GET/POST/PATCH) — no new backend code needed.

---

## Epic F — Integration Reliability

### Changes made (additive, surgical)

**`integrations-ui.tsx`:**
- "مزامنة" button renamed to "آخر الأحداث" — accurately describes what the endpoint does (fetches last 10 events, not a real sync from the store API)
- Help text updated to explain this distinction clearly
- Test-connection note updated to mention it creates a temporary test order

### What was already working (verified, not changed)
- Connection health status (`healthy`/`degraded`/`failed`) — auto-updated on every webhook
- Retry for failed events — already had button in event log
- Soft-delete (disconnect without data loss)
- HMAC-SHA256 webhook signature verification
- Rate limiting per IP + per tenant

---

## Epic G — Dashboard Modernization

### Changes made (targeted, additive)

- `settings/page.tsx` — "ترقية الخطة" button replaced with `<Link href="/pricing">` (was a dead button)
- `nav-items.tsx` — "قاعدة المعرفة" renamed to "مركز التدريب" (reflects new Training Center scope)
- `nav-items.tsx` — Added "أتمتة التجارة" and "تصدير البيانات" entries
- The Getting-Started checklist (Epic A) already modernizes the overview UX significantly

### Scope note
Full CSS consistency sweep of `inbox-ui.tsx` (942 lines) is a separate visual-polish pass. The existing inbox is functional and production-stable — CSS-only changes are lower priority than new functionality.

---

## Epic H — Operations

### What was enhanced

**`app/api/system/health/route.ts`** — Added:
- `queue.deadLetter` — messages with `attempts >= 5` (exhausted retries)
- `errors.warn24h` — warning-level safety audit events in last 24h
- `ai.cacheHits7d` — LLM cache hit count from MetricEvent (cost savings indicator)
- `broadcasts.sending` + `broadcasts.queued` — active broadcast pipeline visibility

**`app/dashboard/system-health/system-health-ui.tsx`** — Enhanced:
- Auto-refresh every 30 seconds with on/off toggle
- "Last updated" timestamp display
- Overall status banner (green healthy / red alerts)
- Dead-letter queue metric
- Warn24h error count
- Cache hits with "توفير في التكلفة" label
- Broadcast pipeline status (sending + queued)

---

## Verification

All changes are additive:
- 1 new schema field (`Bot.teamMembersJson`) — requires `prisma db push` on deploy
- No changes to: send pipeline, queue, billing, subscriptions, Customer 360, analytics
- All new routes wrapped with `requireUser()` + error handling
- All new UI components use existing design tokens (`.card`, `.btn-primary`, `.btn-ghost`, `.input`, `.page-title`, `.section-title`)

Run:
```bash
npx tsc --noEmit
npm run build
npm run verify:all
```
