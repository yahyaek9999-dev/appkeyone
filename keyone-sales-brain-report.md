# KEYONE — AI Sales Brain Report

**Date:** 2026-06-01
**Scope:** One premium feature block — *AI Sales Brain + Revenue Copilot*
**Commit:** `aca3cbb` — `feat(sales-brain): complete AI Sales Brain command center`
**Status:** ✅ Live in production · service recovered after a deploy-tooling outage (details below)

---

## 1. What this delivers

A single command-center screen that makes KEYONE behave like a sales manager,
plus one-click admin reply suggestions inside the inbox. **Everything is
read-only and computed from existing tables — no schema rewrite, no new
models, and zero extra LLM cost for the dashboard.**

| Requested | Where it lives | Source of truth |
|---|---|---|
| Hottest leads | Sales Brain signals + `/dashboard/intel` | `detectHotLeads` (existing) |
| Customers needing follow-up | `/dashboard/intel` | `detectFollowUpOps` (existing) |
| Customers likely to buy | Sales Brain signals (hot leads / awaiting) | daily-report aggregate |
| Lost sales recovery list | `/dashboard/intel` | `detectLostCustomers` (existing) |
| Best-selling products | Sales Brain → Revenue | `OrderItem` rollup (**bug fixed**, see §3) |
| Revenue today | Sales Brain → Revenue | `Order.total` |
| Weekly revenue trend | Sales Brain → sparkline | `Order` (7-day bucket) |
| Conversion rate | Sales Brain → Revenue | orders ÷ active customers (7d) |
| Repeat customers | Sales Brain → Revenue | `Customer.orderCount` (hardened, see §3) |
| AI recommendation of the day | Sales Brain → top card | `lib/daily-report/insights` (reused, no LLM) |
| 3 admin replies (quick / sales / close) | Inbox AI panel | `/suggest-reply` (1 LLM call, on demand) |

---

## 2. What was actually built this session

The previous session had already created the **backend** for the Sales Brain
(`lib/sales-brain/revenue.ts`, `app/api/sales-brain/route.ts`,
`app/dashboard/sales-brain/page.tsx`) and the **intel detectors**
(`lib/intel/*`) and the **inbox suggestion route + UI**. But the page imported
`./sales-brain-ui` **which did not exist** — so the build was broken. This
session finished the block:

1. **`app/dashboard/sales-brain/sales-brain-ui.tsx`** *(new — the missing piece)*
   - Recommendation-of-the-day card, 5 headline signal tiles, a deep-link to
     the ready-to-send detector lists, revenue tiles (today / 7d / AOV /
     conversion), an inline SVG **sparkline** (no chart dependency),
     best-sellers list, repeat-customer line, and top AI insights.
   - Pure consumer of `/api/sales-brain` — one request, all data.

2. **`lib/sales-brain/revenue.ts`** — two fixes (see §3).

3. **`app/api/inbox/conversation/[customerId]/suggest-reply/route.ts`**
   - Re-pointed the three suggestion angles to exactly **quick reply
     (رد سريع) / sales reply (رد بيعي) / close-the-sale (إغلاق البيع)** to
     match the spec. Prompt-only change — still one LLM call, same token cap.

4. **`app/dashboard/nav-items.tsx`** — added the “عقل المبيعات” sidebar link.

No backend rewrite. No new models. No migrations authored.

---

## 3. Bugs found & fixed during verification

Verification (running the real endpoint against the DB) caught two real defects
in the inherited `revenue.ts`:

- **Best-sellers always returned empty (silent).** The raw SQL compared
  `Order.createdAt >= ?` against an **ISO string**, but Prisma's SQLite
  connector stores `DateTime` as **INTEGER epoch-ms**. The mismatch matched
  zero rows, and the `.catch(() => [])` hid it. → Fixed to pass
  `monthStart.getTime()`. Verified: a seeded order now surfaces in
  `bestSellers`.

- **Repeat-customer query could 500 the whole page** on any DB where
  `Customer.orderCount` wasn't present. → Wrapped with a graceful
  `.catch(() => [])` fallback (mirrors the sibling query), so the widget
  degrades to `0` instead of taking down the dashboard.

---

## 4. Pre-deploy checks (all passed)

| Check | Result |
|---|---|
| `tsc --noEmit` (typecheck) | ✅ clean, exit 0 |
| `npm run build` (local) | ✅ Compiled successfully; `/dashboard/sales-brain` = 5 kB |
| Endpoint shape (authed, local) | ✅ 200 — all revenue keys, 7 trend points, signals object |
| Live-data widgets (seeded order, local) | ✅ revenueToday/AOV/repeat/**bestSellers** all correct, temp rows cleaned up |
| Inbox suggestions | ✅ route + 3-reply panel compile and wire (one-click insert) |
| No regression | ✅ existing `/api/intel`, `/login`, `/api/health` unaffected |

---

## 5. Deploy — incident & recovery (important)

The deploy was run **once** via the project’s `deploy.sh`. The code pushed
fine, but the **VPS half of `deploy.sh` failed and briefly took the service
down**. Root causes were in the deploy tooling/environment, **not** the Sales
Brain code:

1. **Wrong ordering:** `deploy.sh` runs `npm ci` *before* stopping the service,
   so the running app held a lock on `query_engine-windows.dll.node` →
   `EPERM: unlink` → `npm ci` aborted and left `node_modules` half-wiped.
2. **Prisma version drift:** the standalone `npx prisma generate` step resolved
   to **Prisma 7.8.0** (not the pinned **5.22.0**), which rejects
   `url = env(...)` in the schema.
3. Consequently `npm run build` failed (`'prisma' not recognized`), and
   `nssm start` returned `SERVICE_PAUSED` (restart throttle).

**Recovery performed (with your authorization):**
- Forced the service to a clean `SERVICE_STOPPED` state and killed the
  lingering node process (released the DLL lock).
- Re-ran `npm ci` cleanly → installed the pinned **prisma 5.22.0** +
  `@prisma/client 5.22.0`, bin shims restored.
- Built via `npm run build` (resolves the **local** prisma 5.22.0, not v7) →
  query engine generated, fresh `.next` build, no errors.
- Started the service → `SERVICE_RUNNING`, port 3000 listening.

**Post-recovery production checks (on the VPS):**

| Route | Status |
|---|---|
| `/api/health` | 200 |
| `/api/sales-brain` | 401 (live, auth-protected) |
| `/dashboard/sales-brain` | 307 (live, redirects to login) |
| `/api/intel` | 401 (intact) |
| `/login` | 200 |

`schema.prisma` was **not** changed by this commit, so the production DB already
matched the schema it had been running on — no `prisma db push` was needed
(and the orderCount query is hardened regardless).

---

## 6. Recommended follow-up (separate from this feature)

`deploy.sh` is fragile and caused the outage. Recommended hardening (one-line
edits, no app code):

1. **Stop the service before `npm ci`/build**, start it after — avoids the
   DLL lock.
2. **Pin Prisma** in the deploy step: use `npm run build` (which uses the
   local `.bin/prisma`) or `npx prisma@5.22.0`, never bare `npx prisma`.
3. Add `prisma db push --skip-generate` only when the schema actually changes
   (the canonical `deploy.ps1` already does this).

---

## 7. Files changed

```
saas/app/dashboard/sales-brain/sales-brain-ui.tsx        (new)  — command-center UI
saas/app/dashboard/sales-brain/page.tsx                  (new)  — from prior session
saas/app/api/sales-brain/route.ts                        (new)  — from prior session
saas/lib/sales-brain/revenue.ts                          (new + 2 fixes)
saas/app/api/inbox/conversation/[customerId]/suggest-reply/route.ts  (mod) — quick/sales/close
saas/app/dashboard/nav-items.tsx                         (mod)  — sidebar link
```

**Rules honored:** existing data only · reused existing models/services ·
no backend rewrite · no schema change · production behavior preserved ·
low token usage (dashboard = 0 LLM calls; inbox = 1 call on demand) ·
compact implementation.
