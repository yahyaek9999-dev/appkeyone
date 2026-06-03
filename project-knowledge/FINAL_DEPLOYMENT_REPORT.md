# KEYONE — Final Deployment Report

**Date:** 2026-06-03
**Deployment window (UTC):** commit `09:53` → service `SERVICE_RUNNING` ~`10:10`
**Result:** ✅ **DEPLOYMENT SUCCESSFUL**
**Production version (live):** `375bf6c-20260603` (was `a0fb40f-20260602`)

---

## 1. Deployment success/failure

✅ **SUCCESS.** `deploy.sh` completed end-to-end with exit code `0` and printed `=== Deploy complete ===`. The VPS service `mse-saas` restarted cleanly to `SERVICE_RUNNING`, and the live `/api/health` now reports the new commit.

Pipeline stages (all succeeded):
1. ✅ Local commit + push (`a0fb40f..375bf6c` → `main`)
2. ✅ VPS `git fetch` + `reset --hard origin/main` (`HEAD is now at 375bf6c`)
3. ✅ `mse-saas` stopped (released Prisma DLL lock)
4. ✅ `npm ci` (459 packages, ~8 min)
5. ✅ `prisma generate` (Client v5.22.0)
6. ✅ `next build` — `✓ Compiled successfully`, types valid, **78/78 static pages generated**
7. ✅ `prisma db push --skip-generate` — *"Your database is now in sync with your Prisma schema. Done in 286ms"*
8. ✅ `mse-saas` started → `SERVICE_RUNNING`

---

## 2. Commit hash

| | Commit |
|---|---|
| Previous production | `a0fb40f` (`deploy: 2026-06-02 15:29 UTC`) |
| **New production** | **`375bf6c`** (`deploy: 2026-06-03 09:53 UTC`) |
| Range deployed | `a0fb40f..375bf6c` |
| Files changed | **132 files** (+6,115 / −718) |

---

## 3. Pre-deploy verification gates

| Gate | Result | Evidence |
|------|--------|----------|
| `npx tsc --noEmit` (typecheck) | ✅ PASS | exit 0, no errors |
| `npm run build` (local) | ✅ PASS | compiled, all routes emitted |
| Schema readiness | ✅ READY | additive-only diff (see §5) |
| `npm run verify:all` (local) | ⚠️ 1 fail | `reliability:wa-service` — **local-env artifact only** (see §8) |
| `npm run verify:reliability` (local) | ⚠️ 1 fail | same single check, same cause |

> The single verify failure was investigated read-only on the VPS prior to deploy and confirmed to be a local-environment limitation (the whatsapp-service is reachable & healthy on the VPS). Full evidence in [WA_SERVICE_INVESTIGATION_REPORT.md](WA_SERVICE_INVESTIGATION_REPORT.md). It does **not** reflect a code/build defect and did not block this deployment.

---

## 4. Deployed features list

New routes/files shipped in `375bf6c` (verified present in the production build manifest):

**Self-service signup + admin approval**
- `app/(auth)/signup/page.tsx`, `app/api/auth/signup/route.ts`
- `app/api/admin/users/[userId]/approve/route.ts`
- User approval workflow (`approvalStatus` / `approvedAt` / `approvedBy`)

**Team members & RBAC (team permissions)**
- `app/dashboard/settings/team/page.tsx` + `team-settings-ui.tsx`
- `app/api/settings/team/route.ts`
- `app/(auth)/team/accept/page.tsx`, `app/api/auth/accept-invite/route.ts`
- `lib/rbac.ts` (role registry: admin | sales | support | viewer)
- New `TeamMember` table

**Automations**
- `app/dashboard/automations/page.tsx` + `automation-builder-ui.tsx`

**Export Center**
- `app/dashboard/export/page.tsx` + `export-ui.tsx`, `app/api/export/route.ts`

**AI Training Center (knowledge)**
- `app/api/knowledge/import-products/route.ts` + knowledge module updates

**Reliability / readiness observability**
- `app/api/ready/route.ts` (readiness probe — db, schema, outgoing-queue)
- `app/api/internal/wa-health/route.ts`
- `app/api/internal/queue-health/route.ts` (existing, retained)
- `scripts/verify/run.js` extended with `reliability` scope

**Dashboard & Mobile UX**
- `app/dashboard/_getting-started.tsx` (getting-started panel)
- `components/ui/toast.tsx`, `components/ui/confirm-dialog.tsx`
- Mobile-responsive shell/nav/inbox/orders updates (verified by local `verify:mobile` pass)

**Ops tooling (non-app)**
- `deploy/health-gate.ps1`, `deploy/verify-backup.ps1`

---

## 5. Schema changes

**Additive-only** (non-destructive; applied via `prisma db push`, no `--accept-data-loss` needed):

| Model | Change | Safety |
|-------|--------|--------|
| `User` | `+ approvalStatus String @default("approved")` | Default keeps all existing rows usable |
| `User` | `+ approvedAt DateTime?` | Nullable |
| `User` | `+ approvedBy String?` | Nullable |
| `User` | `+ teamMembers TeamMember[]` relation | Relation only |
| **`TeamMember`** | **New table** | New (id, ownerId→User cascade, email, role, passwordHash, status, invite fields, timestamps; `@@unique([ownerId,email])`) |
| `Bot` | `+ teamMembersJson String @default("[]")` | Default value |

**Applied on VPS:** ✅ *"Your database is now in sync with your Prisma schema. Done in 286ms."*
Post-deploy readiness probe confirms `schema: ok — core tables queryable`.

---

## 6. Production version

```
GET http://127.0.0.1:3000/api/health  →  200
{"status":"ok","db":"ok","uptime":178,"version":"375bf6c-20260603","latencyMs":5}
```
✅ Live version = **`375bf6c-20260603`** — confirms the new build is serving.

---

## 7. Health status & post-deploy verification

### Core probes
| Endpoint | Status | Detail |
|----------|--------|--------|
| `/api/health` | ✅ `200` | `db: ok`, latency 5 ms, version `375bf6c-20260603` |
| `/api/ready` | ✅ `200` (HTTP) | `verdict: degraded` — db ✅, schema ✅, **outgoing_queue warn** (see §8) |

The `/api/ready` route (new this release) is live and functioning. Its `degraded` verdict is driven **solely** by the pre-existing WhatsApp outgoing-queue backlog, not by any deploy fault: `db: ok`, `schema: ok`.

### Feature route verification (HTTP-level; unauthenticated)
Every requested feature route exists and responds correctly — **no 404s**. Dashboard pages correctly `307`-redirect unauthenticated requests to login; APIs correctly require auth/params.

| Feature | Route | Code | Verdict |
|---------|-------|------|---------|
| Signup | `/signup` | `200` | ✅ served |
| Onboarding | `/onboarding` | `307→login` | ✅ exists, auth-gated |
| Team permissions | `/dashboard/settings/team` | `307→login` | ✅ exists, auth-gated |
| Team permissions | `/team/accept` | `200` | ✅ served |
| Team permissions (API) | `/api/settings/team` | `401` | ✅ exists, auth-required |
| AI Training Center | `/dashboard/knowledge` | `307→login` | ✅ exists, auth-gated |
| Export Center | `/dashboard/export` | `307→login` | ✅ exists, auth-gated |
| Export Center (API) | `/api/export` | `400` | ✅ exists (needs params) |
| Automations | `/dashboard/automations` | `307→login` | ✅ exists, auth-gated |
| Dashboard UX | `/dashboard` | `307→login` | ✅ exists, auth-gated |
| Mobile UX | (build manifest + local `verify:mobile`) | ✅ | shell/nav/inbox/orders shipped |
| Reliability dashboard | `/dashboard/system-health` | `307→login` | ✅ exists, auth-gated |
| Reliability (API) | `/api/internal/queue-health` | `401` | ✅ exists, auth-required |
| Reliability (API) | `/api/internal/wa-health` | `401` | ✅ exists, auth-required |
| System health page | `/dashboard/system-health` | `307→login` | ✅ exists, auth-gated |

**Verification scope note:** checks above are route-existence + correct auth-gating + build-manifest inclusion, performed without an authenticated session. Full authenticated click-through (form submissions, in-page rendering) was **not** performed in this pass and is recommended as a manual smoke test by an operator with login credentials.

---

## 8. Known issue (separate, pre-existing — explicitly de-scoped)

⚠️ **WhatsApp outgoing-queue backlog / session disconnected.**
- WhatsApp session state: `connecting` (`phone: null`, `connectedAt: null`).
- Outgoing queue: `12 queued, all stale, 0 sent in 24h`, oldest ~34h.
- This is an **operational** issue (WhatsApp session not linked), **independent of this code deployment** — the deploy does not modify the WhatsApp send pipeline (per CLAUDE.md constraint).
- Per explicit instruction, it did **not** block deployment.
- It is the sole driver of the `/api/ready` `degraded` verdict.

**Recommended follow-up (not part of this deployment):** re-pair/re-scan the WhatsApp QR session on the VPS, then confirm the 12 stale messages drain (`sent24h > 0`). Full diagnostics in [WA_SERVICE_INVESTIGATION_REPORT.md](WA_SERVICE_INVESTIGATION_REPORT.md).

---

## 9. Rollback status

✅ **Rollback path available and unchanged.**
- Script: [deploy/rollback.ps1](../deploy/rollback.ps1)
- Mechanism: `git reset --hard <prev>` to **`a0fb40f`** + rebuild + service restart.
- Schema rollback safety: this release was **additive-only**, so reverting code does not require destructive DB changes — the new nullable columns/table are simply unused by the older build.
- DB backups: managed by `deploy/backup-all.ps1` / `verify-backup.ps1`.

---

## 10. Summary

| Item | Status |
|------|--------|
| Deployment | ✅ **SUCCESS** |
| Commit | `375bf6c` (from `a0fb40f`) |
| Files changed | 132 (+6,115 / −718) |
| Schema | Additive-only, applied (286ms) |
| Typecheck / Build | ✅ / ✅ |
| Production version | `375bf6c-20260603` |
| `/api/health` | ✅ 200, db ok |
| `/api/ready` | ✅ 200 (degraded — WA queue only) |
| Feature routes | ✅ All present, no 404s |
| Rollback | ✅ Available (→ `a0fb40f`) |
| Outstanding | ⚠️ WhatsApp session reconnect (separate, operational) |

**The completed work is published to production.** The application is live and healthy at version `375bf6c-20260603`. The only outstanding item is the pre-existing WhatsApp session reconnection, which is an operational task unrelated to this code release.

---

*Deployment executed via the standard `deploy.sh` flow. Pre-deploy gates (typecheck, build, schema review) passed. Post-deploy verification performed read-only against the live VPS. The WhatsApp send pipeline was not modified.*
