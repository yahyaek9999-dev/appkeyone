# FINAL DEPLOYMENT MASTER PLAN — KEYONE 5-Agent Transformation

**Generated:** 2026-06-03
**Owner:** Master Coordinator (acting CTO) + Owner (deploy authority)
**Production:** `app.keyone1.com` — single Windows/NSSM VPS, SQLite (cron-mode), Caddy.
**Governing docs:** `MASTER_COORDINATOR_PROMPT.md`, `KEYONE_MISSING_FEATURES_REPORT.md`, `AGENT3_RELIABILITY_REPORT.md`, `POSTGRESQL_MIGRATION_PLAN.md`, `REDIS_WORKERS_PLAN.md`.

> **Philosophy:** ship the most value with the least blast radius. Everything additive, flag-gated, reversible. Revenue features (Wave 1) deploy on the normal hardened path; infra cutovers (Wave 3) use their dedicated maintenance-window runbooks. **No deploy without a green verification gate + explicit owner go.**

---

## 1. Deployment Waves & Order

| Wave | Contents | DB needed | Window | Risk | Deploy path |
|---|---|---|---|---|---|
| **0** | Observability (A4-T1), RBAC wrapper publish (A5), intelligence signature freeze (A1) | none | normal | Low | Hardened standard |
| **1** | Self-learning wiring (A1), abandoned-cart + affinity (A3), activation instrumentation + checklist (A2), RBAC enforcement + rate-limit + audit log (A5) | none | normal | Low–Med | Hardened standard |
| **2** | Customer Twin + memory graph (A1), demo mode + mobile/PWA + analytics surfacing (A2), automation builder + commerce sync (A3), analytics compute + Redis/workers (A4), public API + webhooks (A5) | none (Redis optional) | normal | Med | Hardened standard (+ Redis runbook) |
| **3** | Postgres cutover → blue-green (A4), SSO + white-label + multi-workspace (A5) | Postgres | **maintenance** | High | Dedicated runbooks |

**Golden rule:** Wave N deploys only after Wave N−1 is green in production for ≥24h. Within a wave, features are independently revertible (separate flags).

---

## 2. Standard Hardened Deploy Path (Waves 0–2)

Per `AGENT3_RELIABILITY_REPORT.md` §3 — gates at both ends:
```
1.  deploy/verify-backup.ps1                 # PRE: prove yesterday's backup restores (exit 0)
2.  backup-all.ps1                           # PRE: fresh pre-deploy snapshot
3.  git reset --hard origin/main             # pull merged, coordinator-approved tree
4.  nssm stop mse-saas
5.  npm ci && npm run build                  # prisma generate + next build (must succeed)
6.  npx prisma db push --skip-generate       # additive schema only (new nullable cols / append-only tables)
7.  nssm start mse-saas
8.  deploy/health-gate.ps1 -AutoRollback     # POST: gate on /api/ready; auto-rollback if not ready
9.  npm run verify:reliability && npm run verify:all   # POST: full posture
```
**Pre-merge gate (Coordinator, on the build host) — all must pass with captured output:**
```
npx tsc --noEmit && npm run build && npm run verify:system \
  && npm run verify:orders && npm run verify:commerce \
  && npm run verify:mobile && npm run verify:reliability
```
**Feature enablement is separate from deploy:** code ships dark (flags OFF). Turn features on per-account/plan **after** the build is green, one at a time.

---

## 3. Risk Analysis & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| RBAC enforcement denies an **owner** (regression) | Med | **Critical** | Owner-parity manual gate is mandatory in §5; owners bypass all gates by design; ship A5-T1 behind a `RBAC_ENFORCE` flag, enable after parity proof |
| An agent touches the protected send pipeline | Low | **Critical** | Coordinator scope-check rejects any diff into `lib/messaging/*`, `lib/wa.ts`; CI grep guard |
| Abandoned-cart / automation **double-sends** or floods | Med | High | OFF by default; idempotency + per-customer action cap + opt-out + existing pacing; test-account proof before enabling |
| Schema drift between SQLite & Postgres files | Med | High | Coordinator lock-step diff gate; `prisma db push` additive-only |
| Postgres cutover data loss | Low | **Critical** | Backup-verified first; ETL rehearsed on backup with row-count match; SQLite retained 7d; rollback deadline pre-agreed |
| Redis/workers double-drain broadcasts | Low | High | Quiesce + single-drainer discipline; atomic claim; <1-min flag rollback |
| New public API abused / cost spike | Med | Med | Scoped API keys + rate limits (A5-T3/T4); per-tenant cost observability (A4-T1) catches it |
| Multi-workspace breaks single-tenant scoping | Med | High | Implicit default workspace for existing users; flagged OFF; parity-proven before enable |
| Build/typecheck regression from merged work | Med | Med | Full pre-merge gate; no merge without green tsc+build+verify |

---

## 4. Rollback Plan

**Per-feature (preferred):** every behavior-changing feature is flag-gated → **disable the flag**, no redeploy. First response to any anomaly.

**Per-deploy (Waves 0–2):** `deploy/health-gate.ps1 -AutoRollback` auto-reverts on failed `/api/ready`. Manual: `deploy/rollback.ps1` restores the pre-deploy snapshot (db + env + sessions). Decide a **rollback deadline** before each deploy ("not green in 30 min → roll back").

**Redis/workers (Wave 3a):** `ENABLE_BULLMQ=0` + re-enable cron tasks + restart `mse-saas` (<1 min). Same DB ledger → no stranded rows.

**Postgres (Wave 3b):** SQLite file never modified during migration → stop service, restore `DATABASE_URL=file:...` + SQLite schema, rebuild, start, `health-gate.ps1`. `deploy/rollback.ps1` restores the full snapshot. Rollback deadline mandatory.

---

## 5. Smoke Tests & Production Validation (after every deploy)

**Tier 1 — liveness/readiness (automated):**
```
curl -s https://app.keyone1.com/api/health     # status: ok
curl -s https://app.keyone1.com/api/ready       # ready: true
curl -s -H "x-internal-secret: $SAAS_INTERNAL_SECRET" \
  https://app.keyone1.com/api/internal/wa-health # status: ok
```
**Tier 2 — owner-parity & core path (manual, ~5 min):**
- Log in as an existing **owner** → open inbox, customers, orders, broadcasts, settings, sales-brain, revenue-copilot. **No new denial anywhere.**
- Send a WhatsApp message to the connected number → bot replies (send pipeline intact).
- Open a customer → Customer 360 renders, NBA card shows, no errors.
- Create/extract a test order → status lifecycle works.

**Tier 3 — feature-specific (per enabled flag):**
- Self-learning: follow-up priorities reflect learned weights; A/B route refuses tiny-sample winners.
- Abandoned-cart (test account, flag ON): stale cart → exactly one queued recovery; opt-out respected.
- RBAC: a `viewer` token denied on a mutation; owner unaffected.
- Public API: minted key reads `/api/v1/customers`; revoked key 401s.

**Tier 4 — 24-48h watch:** Sentry error rate flat, `/api/internal/tenant-costs` no anomaly, `keyone:dead-letter` ~0, queue depth sane, no Meta quality drop.

---

## 6. Go / No-Go Checklist (per wave)
- [ ] Coordinator pre-merge gate green (tsc + build + all verify scopes) — **outputs captured**
- [ ] Owner-parity manual gate passed
- [ ] Send-path manual gate passed
- [ ] Schema files diff clean (lock-step)
- [ ] All new features flag-gated, default OFF
- [ ] Backups verified (`verify-backup.ps1` exit 0)
- [ ] Rollback path + deadline agreed
- [ ] Owner explicit **GO**

If every box is checked → deploy the wave, then enable features one at a time with Tier-3 validation each. Otherwise → **No-Go**, return to the responsible agent.

---

## 7. Success Criteria (transformation-level)
- **Revenue:** measurable lift in follow-up conversion (self-learning) + recovered carts + cross-sell AOV.
- **Conversion:** activation-funnel drop-off visible and improving (instrumentation → checklist → demo mode).
- **Retention:** churn-risk customers auto-routed to win-back; merchant business analytics live.
- **Enterprise:** RBAC enforced, audit log complete, public API + keys live, rate-limits covering all routes.
- **Scale:** per-tenant observability live; Postgres/workers executable on demand via proven runbooks.
- **Zero regressions:** existing owner accounts unchanged throughout.
