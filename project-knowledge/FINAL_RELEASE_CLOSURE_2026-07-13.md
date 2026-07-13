# KEYONE — Final Release Execution Closure Report

**Date:** 2026-07-13 **Branch:** `claude/affectionate-jones-5c1916` (worktree `affectionate-jones-5c1916`)
**Scope authorization:** release freeze lifted for this session, WhatsApp send-pipeline changes approved, deploy/infra pre-authorized — see conversation record. All work below is committed, typechecked, built, and either live-verified in production or verified against a real local Postgres instance standing in for it.

This is an honest ledger of what a single session actually closed out against the full "final release" runbook, not a claim that KEYONE is now perfect or that every listed runbook item was rebuilt. Where something was found broken or missing and fixed, it's listed with real evidence. Where something was found and deliberately **not** touched — because it needed a design decision, credentials this session doesn't have, or carried more risk than the finding warranted in the time available — it's listed as a known gap with enough detail to pick up later.

---

## 1. Ground truth established (not assumed)

- Production: AWS EC2 `i-07d6da136eab223f9` (`w.keyone1.com`, `13.63.79.43`, eu-north-1), Postgres, systemd services `keyone.service` / `keyone-bridge-gateway.service` / `keyone-wa.service` (legacy), Caddy edge. Confirmed live via SSH: disk 47% used (15GB free), memory healthy (6.2GB available), all services active.
- Local dev in any worktree of this repo could not previously run `next dev` or a full `next build` at all (every page 500'd, not just the 3 documented ones) — root-caused and fixed (§2). Verification for this session was done against a real throwaway local Postgres 16 instance (`keyone_worktree_test`, dropped at session end) standing in for the schema that's actually applied in production.
- Full local `verify:all` suite: 30 pass / 6 skip (legitimately environment-gated) / 0 fail, both before and after this session's fixes (baseline was 6 false-fails, now 0).
- Full `npm run build`: clean, zero errors, first time this worktree has ever produced a real production build.

## 2. Fixed and deployed this session (15 commits, all live on production as of `9a45dd9`)

| # | Commit | What | Real-world impact |
|---|--------|------|--------------------|
| 1 | `e191a74` | verify harness false-failed 6 checks on missing `POSTGRES_URL` instead of skipping | Local dev/CI signal was lying about the product being broken |
| 2 | `4a7ea71` | `sitemap.xml`/`robots.txt` pointed at `k1wb.app.keyone1.com` — a domain that doesn't resolve | Every URL Google would crawl from the sitemap 404'd at the DNS level — live SEO damage |
| 3 | `cdbd3e7` | `lib/db.ts` silently overrode `POSTGRES_URL` with the legacy sqlite `DATABASE_URL` whenever both were set | Any environment with both vars set (every dev worktree) got a broken DB connection; **production only worked by accident** of its `.env` not defining `DATABASE_URL` |
| 4 | `207c6e8` | Two verify checks used unquoted camelCase SQL identifiers, which Postgres case-folds | `orders:commerce-dedup` / `commerce:event-dedup` duplicate-detection safety checks had never once run successfully against real Postgres |
| 5 | `fbc0d85` | **Built** self-service forgot/reset password (was entirely absent — confirmed 404 in prod) | Users who forgot their password had zero recovery path before this |
| 6 | `3f9bfd0` | 3 of 154 models had a foreign-key column with no covering index | `Order.conversationId`, `Subscription.planId`, `Shipment.providerId` — scan cost grows with table size |
| 7 | `a587642` | **Production had zero database backups of any kind** | A bad migration, accidental delete, or app bug could have destroyed all customer data with no way back. Added nightly `pg_dump` + integrity check + 14-day retention; live-verified with a real restore test (2 users, 159 relations came back clean) |
| 8 | `98c9a03` | No `loading.tsx`/Suspense anywhere in the dashboard | Server-rendered pages doing DB queries showed a frozen blank screen on slow loads |
| 9 | `03a65d0` | Customer-controlled WhatsApp name/phone interpolated into the AI system prompt unsanitized, and could spoof this same prompt's own `---` section-delimiter convention | A crafted WhatsApp display name could fake a fake instruction block in the system prompt |
| 10 | `a8cd3f1` | `bridge-gateway` never evicted a stale socket on reconnect (mirrored a class of bug already fixed on the runtime side) | A reconnecting Bridge could leave a stale, possibly half-open socket that `pickUserSocket` might pick for a live send |
| 11 | `bc12967` | **The new password-reset route logged the raw, unhashed reset token** to the server console whenever email delivery isn't configured (i.e. always, right now) + 3 public webhooks had zero rate limiting | Self-inflicted HIGH-severity finding from this session's own security pass, fixed same session before it could be exploited; webhook flood/DoS vector closed (live-verified: 429 at request 300) |
| 12 | `4c1de35` | "Archive customer" set the DB flag but no list query ever excluded archived customers | Archiving silently did nothing |
| 13 | `ce2fabf` | Broadcast cron's stale-claim recovery had no time filter at all (reset every `sending` item every tick) | Real race risk given batch-size × delay math sits close to the 60s tick interval; could double-process a broadcast item |
| 14 | `c923195` | Customer-facing plan-upgrade path didn't reset usage counters (admin path did) | Mid-cycle upgraders could hit their old plan's lower limit despite paying for more |
| 15 | `9a45dd9` | Locked Bridge spec doc still described the retired Go/whatsmeow runtime | Doc/reality drift for anyone building from the spec |

Every fix above was typechecked, most were exercised with a real functional test (not just "it compiles") — see the conversation record for the specific curl sessions, Postgres restore test, socket-eviction simulation, and rate-limit flood test. Deployed via `deploy/release-aws.sh` (the documented, self-verifying, self-healing deploy path) in two batches, each confirmed via `/api/health`, `/api/ready`, and full post-deploy page/redirect checks.

## 3. Audited and found genuinely solid (no action needed)

- **Admin panel RBAC**: every one of 45 admin pages / 65 admin API routes gated correctly; no route found missing an auth check.
- **AI fallback/retry, conversation memory, caching, AI-audit diagnostics, Playground degradation**: all real, working code, not stubs.
- **Bridge QR/reconnect/restart/logout/session-restore, checksum-verified auto-update with crash-safe rollback, all 5 installer platforms, uninstall on all 3 OSes**: coherent and correct.
- **Wallet ledger, payment webhook signature verification + idempotency, refund reversal, subscription-expiry enforcement-on-read**: money-correctness-critical paths, all verified sound.
- **SQL injection, SSRF, path traversal**: no exploitable instance found anywhere in the codebase.
- **Customer list search/pagination, tagging, CSV export, bulk import, cron scheduling query correctness**: all real server-side implementations, not client-side facades.

## 4. Known gaps — found, deliberately not rebuilt this session

Each of these needs either a design decision, credentials/access this session doesn't have, or more careful, dedicated attention than a rushed fix under a broad mandate deserves. Listed so nothing is silently lost.

**Needs external credentials (not a code problem):**
- No off-site backup copy — the `keyone` IAM user has no `s3:CreateBucket`/`s3:PutObject` permission (confirmed via direct `AccessDenied`). One IAM grant + one `aws s3 cp` line closes it; see `deploy/backup/README.md`.
- Password-reset emails don't actually send — no platform-level SMTP/SES credentials exist anywhere (verified). The flow is fully built and fails closed (never fakes success); wiring `PLATFORM_SES_*` env vars activates it with no code change.

**Needs a design decision before touching (risk of a rushed fix making things worse):**
- AI replies have no pre-send validation against the real product catalog — a hallucinated price/product could reach a real customer. `lib/arena/hallucination.ts` only checks the offline Testing Arena, not the live send path.
- Inbox media (images/voice/documents from customers) is converted to an AI-written caption only — `Message.mediaUrl` is never populated, so operators can never see what a customer actually sent, only a description of it. Needs real media storage design.
- Dual price authority: `lib/pricing/catalog.ts` and the DB `Plan` table can silently disagree (the sync script is manual-only, not wired to build/deploy).
- Broadcast retry: a transient send failure (rate limit, network blip) is marked permanently `failed` with no retry — same severity class as issue #7 above but needs a transient-vs-permanent error taxonomy first.

**Real gaps, smaller/lower-urgency, safe to schedule normally:**
- Inbox SSE never reconnects after the first drop — permanently falls back to 20-30s polling for the rest of the session.
- Inbox search only covers the last message of the 200 most-recently-active conversations (client-side over an already-narrow server slice).
- No campaign edit/duplicate/pause/resume (schema has no "paused" status at all).
- No merge-duplicate-customers tool (already has a TODO acknowledging this in the code itself).
- No admin maintenance-mode banner, no cross-tenant audit-trail viewer, no live-togglable feature-flag admin UI, no Invoice model/PDF generation.
- 39 of 51 dashboard client components that call `fetch()` don't use the existing toast system — inconsistent error feedback, though several substitute a reasonable inline banner instead.
- No custom branded 404 page (falls back to Next.js's generic one).
- `app/dashboard/orders/page.tsx` fetches full rows with no `select` (highest-traffic dashboard list); `framer-motion` ships in the shared dashboard bundle for every page via `mobile-nav.tsx`/`page-transition.tsx` not being dynamically imported; a handful of raw `<img>` tags on product/avatar list views instead of `next/image`. All real but low-urgency at current scale (single 8GB instance, small customer base) — see the performance-audit detail in the conversation record.
- No email-verification enforcement on signup (`SIGNUP_AUTO_APPROVE` grants immediate access); no server-side JWT session revocation (stateless-by-design tradeoff, already accepted elsewhere in the codebase).

## 5. What this closure deliberately did not attempt

Rebuilding the media pipeline, adding real-time delivery/read receipts to the Bridge protocol, building an Invoice/PDF system, or redesigning campaign lifecycle management are all legitimate "premium SaaS" features from the runbook's wishlist, but each is a multi-day design-and-build effort in its own right, not a same-session fix. Attempting them under time pressure in a single pass would have meant shipping half-tested surface area on a production system with real paying customers — exactly the kind of risk this closure report is trying to flag rather than create. They're captured above so the next session can pick any of them up with full context.

## 6. Architecture

See the accompanying interactive diagram (published as a Claude Artifact in this conversation) for the full system map: frontend, backend, gateway, Bridge, AI, database, workers/cron, queues, realtime, storage, deployment, monitoring, admin, billing, recovery, broadcast/campaigns, and CRM — annotated with what's solid vs. what's a known gap per this report.
