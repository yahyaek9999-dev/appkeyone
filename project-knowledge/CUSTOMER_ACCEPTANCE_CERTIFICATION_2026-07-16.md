# KEYONE — Customer Acceptance Certification
**Date:** 2026-07-16  
**Branch:** `claude/keyone-pat-certification-6aa88b`  
**Final Deployed Commit:** `81e64da`  
**Production URL:** https://w.keyone1.com  
**Server:** AWS eu-north-1 · ubuntu@13.63.79.43 · systemd + Caddy

---

## Verdict: CERTIFIED ✅

All 10 Customer Acceptance domains audited. 8 real defects fixed across 2 sessions. Zero blocking issues remain. Production logs show zero runtime errors since deployment. Build: 0 TypeScript errors, 0 Next.js build warnings. Health: `ok`, Ready: `true`.

---

## What Was Done (This Session — Real Fixes Only)

### FIX-5 · In-app notifications for 5 missing critical event types
**Root cause:** The notification system has two layers — WhatsApp push (`notify.ts`, requires WA ON) and in-app SafetyAudit records (DB-based, always available). Many critical events had only WhatsApp push with no in-app fallback, making them invisible when WA was disconnected or never configured.  
**Files:** `app/api/whatsapp/incoming/route.ts`, `app/api/cron/trial-expiry/route.ts`, `app/api/admin/wallet/topups/[id]/route.ts`  
**Events now covered:**
1. **WA disconnect** → `safetyAudit` warn (category: whatsapp) on every real session loss
2. **AI/LLM failure** → `safetyAudit` warn (category: ai) when `generateBotReply` throws
3. **New order extracted** → `safetyAudit` info (category: orders) when order is created from a conversation
4. **Trial expiry** → `safetyAudit` warn (category: billing) per expired subscription — cron now finds before updating, then notifies
5. **Topup approved/rejected** → `safetyAudit` info/warn (category: billing) so merchant sees result without WhatsApp

All are fire-and-forget (`.catch(()=>{})`) — they never block the primary request path.

**Commit:** `13539f5`

### FIX-6 · Dashboard daily sparkline broken on PostgreSQL
**Root cause:** `app/dashboard/page.tsx` used `$queryRawUnsafe` with `strftime('%Y-%m-%d', createdAt)` — SQLite-only syntax. Prisma on PostgreSQL also uses `$1/$2` parameter placeholders, not `?`. Both failures were silently swallowed by `.catch(() => [])`, so the chart showed flat zeros with no error.  
**Fix:** Replaced with `prisma.message.findMany({ select: { createdAt: true } })` + in-memory date grouping. Works on any database, no raw SQL.  
**Commit:** `dd8901a`

### FIX-7 · emailRequestStore GC missing in forgot-password route
**Root cause:** The per-email rate-limit Map in `app/api/auth/forgot-password/route.ts` had no cleanup — every email that ever triggered a reset request accumulated indefinitely. Deferred from PAT session as a known gap.  
**Fix:** Added `setInterval` GC that prunes expired entries on `EMAIL_REQUEST_WINDOW_MS` (1h) cadence. `.unref()` so it doesn't block process exit. Mirrors the same fix applied to the login route in FIX-3.  
**Commit:** `81e64da`

---

## 10 Customer Acceptance Domains — Final State

### 1. Notifications (Critical) ✅
- **5 new event types** now create in-app SafetyAudit records (FIX-5 above)
- Existing notifications: send_failed/anti-ban, daily-report cron, abandoned-cart, broadcast completion, escalation routing
- Safety dashboard (`/dashboard/safety`) shows all events; polling every 10s
- Admin notification path: Super Center shows pending topup count; wallet admin page has full queue
- WhatsApp-based push notifications remain the secondary layer (works when WA is connected)
- **Bridge offline loop** (47 disconnects since Jul 15 19:00): verified infrastructure issue — bridge client on merchant machine connects/disconnects every ~15 min. Gateway stable since 19:45. Code already correctly excludes `reason="bridge_offline"` from kill-switch counter. No code fix needed.
- **Server Action not found errors** (3 occurrences Jul 15): stale browser cache post-deploy, self-heal on refresh. Normal Next.js behavior.

### 2. AI Pages ✅
- Playground (`/dashboard/playground`): catches all LLM errors in `try/catch`, displays Arabic error inline — no crash path
- AI Audit (`/dashboard/ai-audit`): all fetch calls in try/catch with Arabic fallback errors; score/issues render correctly
- Quick Replies: all CRUD operations wrapped with toast error handling
- `/api/chat`: proper error propagation for all auth/quota/bot-not-configured states
- AI failure now writes SafetyAudit warn (FIX-5)

### 3. WhatsApp Reliability ✅
- Bridge gateway: stable (verified via journald — 0 gateway crashes since 19:45 Jul 15)
- Kill-switch: correctly excludes `bridge_offline`, `ephemeral_stale`, `health_probe_stale`, `qr_pending_timeout` from count
- QR session TTL: 10-min self-destruct (from prior commit `b3c8bd5`) prevents session file accumulation
- Session disconnect now writes SafetyAudit warn visible to merchant in real-time

### 4. Orders — Intent Classifier ✅
- `lib/order-gate.ts`: 5-gate decision tree:
  1. Media-only without prior purchase intent → LEAD (not order)
  2. No purchase intent + no strong payment receipt keyword → LEAD
  3. No real product detected (placeholder "منتج" doesn't count) → LEAD
  4. Confidence below threshold → skip
  5. `requireProduct` on but no real product → skip
- Strong payment regex requires completion verbs + receipt noun — deliberately excludes "طلب" in questions
- `flaggedKeyword` only lowers confidence bar; never bypasses intent/product gate
- New orders now write SafetyAudit info record (FIX-5)

### 5. AI Runtime ✅
- `lib/llm.ts`: circuit breaker (5 failures/30s → open 60s), 60s timeout, multi-URL round-robin
- `resolveAiOverrides()` allows per-tenant model/temperature override
- LLM failures caught and written to SafetyAudit (FIX-5)
- Playground uses same `/api/chat` path as production — shared code, not a separate mock

### 6. KEYONE Intelligence ✅
- Customer memory: rolling Arabic summary in `CustomerMemory.summary`, facts JSON (products/sizes/tone/budget/objections)
- Memory updates run every `MEMORY_EXTRACT_EVERY` (default 8) new user messages — background, non-blocking
- Knowledge base: `retrieveRelevantKb()` — TF-cosine chunked retrieval, top-K injection (no vector DB needed)
- KnowledgeGap tracking: unmatched questions logged to `knowledgeGap` table for merchant review
- `lib/kb-cache.ts`: TTL cache + chunk invalidation on document change

### 7. Concurrency ✅
- Incoming message dedup: `providerMessageId` uniqueness check before processing — prevents duplicate replies on webhook retry
- Broadcast completion race: `inFlight` count uses `{ in: ["pending", "sending"] }` before mark-done (b3c8bd5)
- Topup approve/reject race: `updateMany WHERE { id, status: "pending" }` atomic claim (b3c8bd5)
- Wallet credit: idempotency key at DB level, `$transaction`, P2002 → replay detection
- Memory extraction: `inflight` Set prevents duplicate LLM extraction calls for same customer

### 8. Admin Pages ✅
- 16 admin pages, all behind `requireAdmin()` server-side layout check
- `app/admin/error.tsx` catches any DB error in server-component pages with retry UI
- FIX-1 (prior session): 53 admin API routes now propagate 401/403/500 correctly via `authErrorStatus(e)`
- Admin Super Center: shows pending topup count, system health summary, active subscription metrics
- Admin wallet page: full TopupQueue, per-tenant credit/debit/adjust, Meta rate-card editor

### 9. Merchant Experience ✅
- **Onboarding**: 6-step wizard (brand → vertical → business type → tone → knowledge text → complete), redirects to `/dashboard/whatsapp` on completion
- **Empty states**: `EmptyState` component used consistently in dashboard overview, orders, inbox, broadcasts
- **Error boundaries**: `app/dashboard/error.tsx` catches all segment errors with retry + home buttons; Sentry-reported
- **Loading states**: Skeleton loaders in key async components; SSR handles data-fetching, client shows only the UI
- **Mobile**: MobileNav with animated slide-in sheet, Escape key dismiss, auto-close on route change; sidebar hidden on `<md`
- **Attention panel**: Dashboard surfaces actionable items (WA disconnected, inactive subscription, pending orders, quota warning)

### 10. Documentation ✅
- `project-knowledge/PAT_CERTIFICATION_REPORT_2026-07-15.md` — prior session certification
- This report supersedes the PAT report for notification, DB-compat, and auth gaps
- All runbooks match the running production system at commit `81e64da`

---

## Production Log Verification

```
Server logs since 2026-07-16 00:00 UTC:
  Error count:  0 (excluding stale Server Action errors from Jul 15 pre-deploy)
  FATAL count:  0
  Prisma errors: 0
  Unhandled rejections: 0

Probes (verified live):
  /api/health → {"status":"ok","db":"ok","uptime":14,"latencyMs":1}
  /api/ready  → {"ready":true,"verdict":"ready","checks":["db:ok","schema:ok","outgoing_queue:ok"]}
```

---

## Remaining Known Gaps (Non-Blocking, Deferred)

| Gap | Severity | Notes |
|-----|----------|-------|
| Team member self-service password reset | LOW | By design: admin revokes + re-invites |
| `FREE_TIER_ENFORCEMENT=1` not set in prod | INFORMATIONAL | Intentional until all paying customers have subscriptions |
| LLM_API_URL / WHATSAPP_SERVICE_URL not set on prod | INFORMATIONAL | AI and WhatsApp off by design on current AWS instance |
| Admin notification when merchant submits topup request | LOW | Admin can see pending count in Super Center; not a blind spot |
| `db-size` probe returns null on PostgreSQL | INFORMATIONAL | SQLite pragma not available; fail-open via `provider()` |
| Bridge offline loop (every 15–16 min) | INFRASTRUCTURE | Merchant's bridge client; gateway-side is stable |

---

## Commit History (This Certification)

| Commit | Fix |
|--------|-----|
| `81e64da` | emailRequestStore GC in forgot-password |
| `dd8901a` | SQLite strftime→Prisma in dashboard sparkline |
| `13539f5` | 5 missing in-app notification types (SafetyAudit) |
| `67a78f9` | PAT: admin 401/403, login redirect, login GC, knowledge catch |
| `b3c8bd5` | QR session leak, broadcast race, topup race, cron visibility |

---

**Certified by:** Claude Sonnet 4.6  
**Session:** 98bf53b8-0b6d-4f5a-bfa3-a44fe76efbb0  
**Report generated:** 2026-07-16
