# KEYONE Bridge — Phase 1 Production Verification

**Date:** 2026-07-05 → 2026-07-06 (UTC)
**Exact running commit:** `main` @ **`93e2985`** (Cloud app build `56TOLTu14eMA4r-sfRmUH`; saas subtree byte-identical between the Phase‑1 commit `7e1e042` and the gateway‑only fix `93e2985`).
**Deploy method:** git‑based (commit‑pinned `git archive` → rsync → migrate → build → restart → `~/keyone/DEPLOYED_COMMIT` stamp). Reproducibility gap fixed — prod was previously file‑push deployed with no commit.

## Reproducibility reconciliation (prerequisite)
Production had drifted from `main` (file‑push deploys across many prior sessions). Reconciled: `main` now == production. Two merges to `main`:
1. `be74cec` reconcile: production source baseline (473 files that were never in `main`).
2. `a0f7577` + `7e1e042` + `93e2985`: Bridge foundation + Phase 1 Cloud contract + gateway fix.

## The 13‑point verification (on the running production server)

| # | Item | Result |
|---|---|---|
| 1 | Bridge Phase 1 merged into main (not only local) | ✅ **Merged.** `origin/main` = `93e2985` (was `cbb7eda`). |
| 2 | Deployed to production | ✅ **Deployed** from git; `~/keyone/DEPLOYED_COMMIT` = `93e2985`. |
| 3 | Latest build (commit/branch/build‑id/time) | ✅ commit `93e2985`, branch `main`, BUILD_ID `56TOLTu14eMA4r-sfRmUH`, built/restarted 2026‑07‑06 ~00:5x UTC. |
| 4 | DB migration ran, zero drift | ✅ `prisma migrate diff` = **4 CREATE TABLE, 0 DROP, 0 ALTER of existing tables**; applied via `db execute`. |
| 5 | New Bridge tables exist + app starts clean | ✅ `Bridge, BridgeTransport, BridgeAuthCode, BridgeToken` = **4/4**; keyone active, all pages 200. |
| 6 | `BRIDGE_ENABLED` OFF by default | ✅ env **absent → OFF**; `/api/bridge/*` → 404; no dashboard surface. |
| 7 | Existing QR / Meta customers unaffected | ✅ both bots still `qr`; Meta‑cloud + QR pages 200; nothing routes to a bridge when off. |
| 8 | Zero TS errors, build passes | ✅ `tsc --noEmit` = 0; `npm run build` exit 0 (prisma generate + next build). |
| 9 | Dashboard Bridge options visible when enabled | ✅ (flag on, HTTP 200, rendered HTML): transport selector shows **KEYONE Bridge**; settings hub links **/dashboard/settings/bridge**; Bridge panel shows the live test bridge **متصل (online)** with آخر نبضة/أساسي/إعادة الاتصال/فصل controls; link page shows the code‑approval form. *(No literal screenshot image — no browser extension connected to this environment; rendered markup captured instead.)* |
| 10 | `/api/bridge/*`, auth, status, health, WS handshake | ✅ health 200 (enabled)/404 (off); device‑code flow `start→approve→token` issues a hashed‑only token; `status` returns bridges w/o token hash; **WS handshake `hello→hello_ack`, `heartbeat→heartbeat_ack`, Bridge→online**; bad token → upgrade rejected. |
| 11 | Full regression (Inbox/Orders/Campaigns/Recovery/AI/QR/Meta/Dashboard/Admin) | ✅ all 200 (Admin 307 = correct login redirect); APIs 200; QR gateway healthy; services active. |
| 12 | No production regressions | ✅ confirmed off‑state; existing product byte‑identical. |
| 13 | Fix any issue before reporting | ✅ **One bug found + fixed:** the WS gateway verified the token *after* accepting the upgrade, so the first `hello` frame raced the `message` listener and was dropped (Bridge never went online). Moved auth into `verifyClient` (upgrade‑time) → handshake now reliable. Committed `93e2985`, redeployed, re‑verified. |

## What is deployed (all additive, flag‑gated, send pipeline untouched)
- `lib/messaging/mode.ts`: 3rd `connectionMode = "bridge"` (unknown still → qr).
- `lib/bridge/{flags,crypto}.ts`: `BRIDGE_ENABLED` (default off); hash‑only token/PKCE/HMAC primitives.
- Prisma: 4 create‑only tables + `User.bridges`, in both schemas.
- `/api/bridge/v1/*`: `health`, `device/start`, `device/approve`, `device/token`, `token/rotate` (reuse‑detection), `revoke`, `status`, `primary` — RFC 8628 + PKCE, all 404 when flag off.
- Dashboard: transport chooser, Bridge panel, device‑link approval page, settings card — all rendered only when `bridgeEnabled()`.
- `bridge-gateway/` (new systemd service `keyone-bridge-gateway` on :3002): WS handshake stub (protocol v1, fail‑closed token verify). *Phase‑2 = full inbound/outbound relay.*

## Final production state
`BRIDGE_ENABLED` is **OFF** (Phase 1 has no installer/daemon yet — the Go Bridge core is Phase 3). The Bridge is fully built, migrated, and inert; enabling it later is a one‑line env flip. Verification test bridges were cleaned up (0 rows). Meta Cloud and QR are unchanged. Services: `keyone`, `keyone-wa`, `keyone-qrcron`, `keyone-bridge-gateway` all active.
