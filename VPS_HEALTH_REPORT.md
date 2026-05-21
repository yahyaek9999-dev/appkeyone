# KEYONE VPS Health Report

Date: 2026-05-21
VPS: `217.154.163.16`
App root: `C:\app`

---

## Executive summary

Production is healthy after the cleanup/hardening pass.

- `mse-saas`: running
- `mse-wa`: running
- health endpoint: HTTP 200
- database health: ok
- VPS branch: `main`
- VPS commit: `7ecd1d2`
- VPS Git status: clean
- VPS tracks `origin/main`

No WhatsApp sessions/auth data were deleted or modified.

---

## Runtime health

Health endpoint snapshot:

- endpoint: `http://127.0.0.1:3000/api/health`
- HTTP status: `200`
- app status: `ok`
- DB status: `ok`
- version: `7ecd1d2-20260521`
- observed latency: approximately 1-9ms during checks

---

## Service health

| Service | Status | Notes |
|---|---:|---|
| `mse-saas` | `SERVICE_RUNNING` | Next.js production service on port 3000 |
| `mse-wa` | `SERVICE_RUNNING` | WhatsApp runtime service |

Observed listening ports:

- `0.0.0.0:3000` / `[::]:3000` owned by Node PID `7560`

No process was killed during the audit.

---

## Disk usage

System drive snapshot:

| Metric | Value |
|---|---:|
| Used | 38.25 GB |
| Free | 81.15 GB |

Disk space is healthy.

Backup storage is active under `C:\app\backups`. Recent snapshots include:

- `safe-deploy-20260521-152133` (~0.94 MB)
- `reconcile-20260521-151944` (~0.48 MB)
- `pre-deploy-2026-05-21_142325` (~107.29 MB)
- older rollback/deploy snapshots

Recommendation: add a formal backup retention policy later. Do not delete current rollback snapshots before the next stable release window.

---

## Memory usage

Observed memory snapshot:

| Metric | Value |
|---|---:|
| Total RAM | 7.99 GB |
| Free RAM | 4.46 GB |
| Used RAM | 3.53 GB |

Node processes:

| PID | Working Set | Role |
|---:|---:|---|
| 7560 | ~116.8 MB | `mse-saas` / Next.js production runtime |
| 6564 | ~125.7 MB | likely WhatsApp/runtime Node service |

Memory is currently healthy.

---

## Chromium / browser process hygiene

Observed Chrome/Chromium/Edge process count:

- `0`

This is good for current stability and means no obvious orphan Chromium process leak was present during the snapshot.

For future WhatsApp/Baileys scaling, keep monitoring:

- Chromium child process count
- session hibernation behavior
- idle session cleanup
- process memory after reconnect storms

---

## Backup and rollback state

Rollback capability is intact:

- full backup script exists: `C:\app\deploy\backup-all.ps1`
- rollback script exists: `C:\app\deploy\rollback.ps1`
- latest deploy backup exists: `C:\app\backups\safe-deploy-20260521-152133`
- larger pre-deploy rollback snapshot exists: `C:\app\backups\pre-deploy-2026-05-21_142325`

Rollback script now supports:

- `-ListOnly`
- `-DryRun`

These modes allow rollback readiness checks without stopping services or modifying files.

---

## Runtime risks

Current risks are manageable:

1. Backup retention is manual.
2. SQLite is suitable for current scale but remains a scaling bottleneck as tenants/orders/messages grow.
3. WhatsApp runtime must preserve session/auth folders; future Baileys migration should keep isolation and rollback.
4. Root legacy Python/LLM helper files should be reviewed before future AI work.
5. The VPS GitHub key should eventually be replaced by a dedicated deploy key instead of a copied developer key.

---

## Scaling bottlenecks to watch

- SQLite write concurrency as message/order/event volume grows.
- SSE polling cost with many active dashboard tabs.
- WhatsApp session RAM if many sessions run concurrently.
- Broadcast/follow-up cron overlap under high throughput.
- Commerce webhook retry/queue growth.
- Next.js memory under long-lived API streams.

---

## Recommendations

Short term:

- Keep using `keydeploy` for all deploys.
- Run `pwsh ./deploy/verify-production.ps1` after every deploy.
- Use `rollback.ps1 -DryRun` before real rollback.
- Continue preserving WhatsApp auth/session data.

Medium term:

- Add automated backup retention.
- Add scheduled health snapshot logging.
- Add process/memory alert thresholds.
- Migrate the VPS GitHub SSH key to a dedicated deploy key.
- Plan PostgreSQL migration before large multi-tenant scale.

---

## Final health status

VPS status: **HEALTHY**

Production safety: **PASS**
