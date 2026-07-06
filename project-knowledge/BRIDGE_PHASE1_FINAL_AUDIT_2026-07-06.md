# KEYONE Bridge — Final Production Audit (pre‑Phase‑2)

**Date:** 2026‑07‑06 (UTC)
**Running commit:** `main` @ **`93e2985`** (saas byte‑identical to HEAD `a31f1b1`, which only adds a docs file).
**Auditor access:** read‑only SSH to the live AWS box (`ubuntu@13.63.79.43`, `~/Downloads/keyone.pem`) + black‑box HTTPS to `https://w.keyone1.com`.
**Verdict: ✅ ALL 9 CHECKS PASS.** Cleared to begin Phase 2. Four non‑blocking nits recorded at the end.

---

## The 9‑point audit (evidence, not assertion)

| # | Requirement | Result | Evidence |
|---|---|---|---|
| 1 | **Git == Server == Running App == Database** | ✅ PASS | `git`: `main`==`origin/main`==`a31f1b1`; saas subtree byte‑identical to running `93e2985`. **Server source rollup = local git rollup, identical over 901 files** (`037f42816be8ffb97303c07ae6e426a5b17d79187cf37bda43f5ff98217afdc1`). `~/keyone/DEPLOYED_COMMIT`=`93e298549e…`; `.next/BUILD_ID`=`56TOLTu14eMA4r-sfRmUH` (matches Phase‑1 report). DB = PostgreSQL 16.14, 4 Bridge tables present. |
| 2 | **No manual server‑only changes remain** | ✅ PASS (source) | The 901‑file source rollup matches git exactly → zero source drift on the box. *(Non‑source deploy artifacts noted in Nits.)* |
| 3 | **Existing QR customers work exactly as before** | ✅ PASS | DB: 2 bots, **both `connectionMode='qr'`**. `keyone-wa` service active; source identical to the last‑verified baseline; Bridge inert. |
| 4 | **Existing Meta Cloud customers work exactly as before** | ✅ PASS | DB: **0 Meta‑configured bots** currently → nothing to regress; Meta code path byte‑identical to baseline; `/dashboard/settings/meta-cloud` + `/dashboard/meta` healthy (307 login‑gated). |
| 5 | **Recovery/Inbox/Broadcasts(“Campaigns”)/Orders/AI zero regressions** | ✅ PASS | Source identical to the baseline that passed the full 13‑point regression. Live routes all healthy: `/dashboard/{inbox,orders,recovery,broadcasts,broadcasts-pro,agents,ai-operations,wallet,whatsapp,meta}` → 307 (correct login gate). *(`/dashboard/campaigns` 404 is expected — no such route; the surface is `broadcasts`.)* |
| 6 | **`BRIDGE_ENABLED` OFF by default** | ✅ PASS | `flags.ts` defaults off (only `1`/`true` enable). On‑box `.env`: `BRIDGE_ENABLED` **absent → OFF**. Runtime: all `/api/bridge/v1/*` → 404; POST `device/start` → `{"error":"not_found"}` 404. |
| 7 | **Existing customers cannot see any Bridge UI** | ✅ PASS | `bridge/page.tsx` gated by `bridgeEnabled()` (renders a plain “not enabled” page when off); settings‑hub link + transport chooser gated; every `/dashboard/*` redirects to login when unauth; all bridge APIs 404. |
| 8 | **Every commit pushed to `origin/main`** | ✅ PASS | `main…origin/main` = `0 0` (no ahead/behind). `feat/bridge-phase1-cloud` also pushed. |
| 9 | **No TODOs / unfinished Phase 1 files** | ✅ PASS | No `TODO/FIXME/HACK/WIP/placeholder` markers in any bridge file (only an input‑field placeholder string). `bridge-gateway/index.js` is a **documented, complete Phase‑1 handshake stub** — that is the intended Phase‑1 scope, not an unfinished file. |

### Runtime state (live box)
- Services: `keyone` (active), `keyone-wa` (active), `keyone-bridge-gateway` (active), `keyone-qrcron` (oneshot driven by `keyone-qrcron.timer`, fires every minute — “inactive” between ticks is correct). Uptime 4d.
- Ports: `:3000` next‑server, `:3001` wa gateway, `:3002` bridge‑gateway, `127.0.0.1:5432` Postgres, Caddy `:80/:443`.
- DB: `Bridge=0, BridgeTransport=0, BridgeAuthCode=0, BridgeToken=0` (Phase‑1 inert; verification test rows cleaned). Column counts: Bridge 14 / AuthCode 10 / Token 7 / Transport 6. Prisma `migrate diff` was 0 at deploy (per Phase‑1 report) and the schema files are inside the 901‑file rollup that matches git.

---

## Non‑blocking nits (do NOT block Phase 2; tracked for cleanup)

1. **Deploy script not committed for the AWS/Linux target.** The committed `deploy/*` scripts still target the **retired Windows VPS** (`Administrator@217.154.163.16`, PowerShell, `C:/app`). The actual git‑based Linux deploy (`git archive → rsync → migrate → build → restart → ~/keyone/DEPLOYED_COMMIT`) that shipped `93e2985` exists only as an ad‑hoc procedure. **Reproducibility gap** — should be committed as `deploy/release-aws.sh`. *(This does not affect the running system; it affects repeatability.)*
2. **Deploy backup clutter on the box:** `~/keyone/.env.bak_bridge_1783299832`, `~/keyone/.next.bak`, `~/keyone/.next.bak2`. Safe rollback artifacts, but housekeeping worth pruning.
3. **`/api/health` reports `version:"dev"`.** The endpoint reads `NEXT_PUBLIC_BUILD_ID ?? BUILD_ID ?? "dev"`; neither env var is injected into the systemd unit, so the health `version` field shows `dev` even though `.next/BUILD_ID` on disk is correct (`56TOLTu14eMA4r-sfRmUH`). Observability‑only nit; inject `BUILD_ID` in the unit to fix.
4. **Micro:** a `GET` to a POST‑only bridge route (`device/start`) returns `405` rather than `404`, mildly revealing the method shape while the flag is off. The functional gate is intact (POST → 404 when off). Negligible.

---

## Conclusion
Git, server source, running build, and database are in lock‑step at `93e2985`. The Bridge is fully migrated and completely inert with `BRIDGE_ENABLED` off — no existing QR customer, no Meta path, and no dashboard surface is affected. **Phase 2 (bridge‑gateway full relay) is cleared to begin.**
