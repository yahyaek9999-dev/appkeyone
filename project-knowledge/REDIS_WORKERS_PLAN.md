# KEYONE — Redis & Workers Activation Plan

**Generated:** 2026-06-03
**Status:** Infrastructure built and dormant. Production runs in **cron mode** (`ENABLE_BULLMQ=0`). No cutover required to stay safe.
**Constraint:** Queue behavior and the WhatsApp send pipeline are NOT modified by this plan — activation only changes *which drainer runs*, not *how messages are paced or sent*.

---

## 1. Current State (dual-mode, cron is primary)

KEYONE ships with two interchangeable execution backends behind a single flag:

| Mode | Trigger | How work runs | Status |
|------|---------|---------------|--------|
| **Cron (default)** | `ENABLE_BULLMQ=0` | Windows Scheduled Tasks hit `/api/cron/*` every 30s–6h; drains DB tables (`WaMessage`, `Broadcast`, follow-ups) | ✅ **Production today** |
| **BullMQ/Redis** | `ENABLE_BULLMQ=1` + Upstash configured + worker process running | `workers/index.ts` consumes Redis queues; cron routes become no-ops | 🟡 Built, dormant |

**Why cron is fine now:** at current volume (single VPS, ~handful of merchants), cron draining of the SQLite-backed `WaMessage` ledger meets latency and reliability needs with far less operational surface than running a separate Redis + worker service. BullMQ becomes worthwhile at higher throughput / multi-instance.

### Existing assets
| Asset | Location | Purpose |
|-------|----------|---------|
| Redis REST client | `saas/lib/redis.ts` | `@upstash/redis` HTTP client; no-op stub in dev; never throws |
| Queue definitions | `saas/lib/queue.ts` | 5 queues: `keyone:broadcasts/notifications/ai-jobs/webhooks/dead-letter`; per-queue retry/backoff; idempotent jobIds; enqueue helpers no-op when flag off |
| Worker entrypoint | `saas/workers/index.ts` | Env validation, **health server on :3010** (`/health`, `/ready`), graceful SIGTERM/SIGINT/SIGHUP |
| Broadcast worker | `saas/workers/broadcast.worker.ts` | Concurrency 1, 2.5s spacing, atomic claim, drift-guarded personalization, dead-letter on terminal failure |
| ioredis connection | `saas/lib/queue.ts` `getWorkerConnection()` | BullMQ-compatible (maxRetriesPerRequest=null), TLS for `rediss://` |
| Queue-health visibility | `saas/app/api/internal/queue-health/route.ts` | Reports BullMQ per-queue counts when enabled, cron depth when not |

---

## 2. When to Activate

Flip to BullMQ when **any** holds:
- Broadcast volume makes 60s cron granularity too coarse (need sub-second pickup / higher concurrency control).
- You run **multiple app instances** (cron-per-instance would double-drain; a single worker pool is cleaner).
- You want **retry/backoff/dead-letter** semantics richer than the cron loop's, with queue-level observability.
- Meta webhook processing volume warrants async offload from the request path.

Do **not** activate just because the code exists. Each added moving part (Redis, a long-lived worker service) is operational cost.

---

## 3. Activation Procedure

### Phase A — Provision Redis
1. Create an Upstash Redis database (or self-host Redis 7+ reachable from the VPS).
2. Capture credentials. The codebase supports both:
   - REST (for app-side `lib/redis.ts`): `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
   - TCP (for BullMQ workers): `UPSTASH_REDIS_URL` (preferred) — or it's derived from the REST URL+token in `queue-health`/`getWorkerConnection`.
3. Verify reachability: `GET /api/internal/metrics` → `redis.reachable: true`.

### Phase B — Stage the worker (no traffic impact)
1. Build workers: `npm run build:workers` (`tsc --project tsconfig.workers.json` → `dist/workers/index.js`). *(Confirm this script exists; if not, add an additive build step — do not alter the Next build.)*
2. Register NSSM service (do **not** start draining yet — keep `ENABLE_BULLMQ=0` so enqueues are still no-ops):
   ```
   nssm install mse-workers "C:\Program Files\nodejs\node.exe"
   nssm set     mse-workers AppParameters "C:\app\saas\dist\workers\index.js"
   nssm set     mse-workers AppDirectory  "C:\app\saas"
   nssm start   mse-workers
   ```
3. Confirm worker health: `GET http://127.0.0.1:3010/health` → 200, `/ready` → 200.

### Phase C — Cutover (the careful step)
The risk during cutover is **double-draining** (cron + worker both sending) or **gap-draining** (neither). Sequence to avoid both:

1. **Quiesce broadcasts:** ensure no broadcast is mid-`sending` (`/api/internal/queue-health` → `broadcastSending: 0`). Pause new broadcast creation briefly.
2. **Disable cron drainers** that BullMQ will own: stop the Scheduled Tasks for `/api/cron/broadcasts` (and any others you're moving). Leave the WhatsApp send pipeline and `outgoing-messages` semantics untouched — only the *trigger* moves.
3. **Set `ENABLE_BULLMQ=1`** in `saas/.env` (enqueues now go to Redis; cron routes self-disable as no-ops).
4. **Restart `mse-saas`** so the flag takes effect, then **restart `mse-workers`**.
5. **Gate:** `/api/internal/queue-health` should now show `bullmq: enabled` with live per-queue counts. Create one small test broadcast (2–3 internal numbers) and confirm it drains via the worker (watch `keyone:broadcasts` waiting→completed).
6. `npm run verify:reliability` — outgoing/broadcast depth sane, no dead-letters.

### Phase D — Stabilize
- Watch `keyone:dead-letter` (should stay ~0), worker `/health` uptime, Redis latency in `/api/internal/metrics`.
- Keep cron task definitions on disk (disabled) for instant fallback.

---

## 4. Rollback (fast)

Cutover is reversible in under a minute:
1. Set `ENABLE_BULLMQ=0`.
2. Re-enable the cron Scheduled Tasks.
3. Restart `mse-saas`.
Enqueues revert to no-op; cron resumes draining the same `WaMessage`/`Broadcast` tables. Because both backends operate on the **same DB ledger**, no data is stranded — in-flight rows are simply picked up by whichever drainer is active. Stop `mse-workers` once confirmed idle.

---

## 5. Guardrails (must hold through activation)

- **Single drainer per queue at a time.** Never run cron broadcast drain and the BullMQ broadcast worker simultaneously — atomic claim protects against double-send, but quiescing first is the discipline.
- **Concurrency stays 1 for broadcasts** with 2.5s spacing — this is anti-ban behavior; do not raise it as part of activation.
- **No send-pipeline changes.** Activation moves the trigger, not `lib/messaging/outgoing-queue.ts` pacing/retry or `lib/wa.ts` send logic.
- **Idempotent jobIds** (`broadcast:<id>`) already prevent duplicate enqueues — keep them.

---

## 6. Checklist

- [ ] Redis provisioned; `/api/internal/metrics` → `redis.reachable:true`
- [ ] `npm run build:workers` produces `dist/workers/index.js` (add script if missing — additive)
- [ ] `mse-workers` registered; `:3010/health` + `/ready` green (with flag still 0)
- [ ] Broadcasts quiesced; cron broadcast task disabled
- [ ] `ENABLE_BULLMQ=1`; `mse-saas` + `mse-workers` restarted
- [ ] `/api/internal/queue-health` shows `bullmq: enabled`; test broadcast drains via worker
- [ ] `verify:reliability` clean; `keyone:dead-letter` ~0
- [ ] Rollback rehearsed (flag→0, re-enable cron, restart) and documented
