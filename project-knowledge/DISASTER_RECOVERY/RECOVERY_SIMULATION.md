# RECOVERY_SIMULATION — KEYONE (VPS-gone scenario)

**Date:** 2026-06-12 · **Mode:** validation only — no changes, no execution.
**Premise:** the VPS `217.154.163.16` disappears **now**. Can KEYONE be rebuilt using **only** (a) GitHub repos, (b) the extracted backups, and (c) the local Mac copies?

---

## Inputs available in this simulation
- **GitHub:** `yahyaek9999-dev/appkeyone` @ `cbb7eda` (app, deploy scripts, Prisma schemas, CI, Caddyfile, Docker).
- **Extracted backups:** `~/Desktop/KEYONE_EOL_EXTRACTION/` (DB+WAL+SHM verified, env, WA sessions, 14 daily gz) — checksums re-verified in [FINAL_ASSET_VERIFICATION](FINAL_ASSET_VERIFICATION.md).
- **Local Mac copies:** AI engine (`mse_ai_api-main/main.py`), CloakBrowser (`CloakBrowser-main/cloakbrowser` v0.3.26), and the local-only UI branch.

---

## What CAN be restored ✅

| Capability | Source | Confidence | Notes |
|---|---|---|---|
| **SaaS app + WhatsApp service** | GitHub | HIGH | `npm ci → prisma generate → build`; reproducible |
| **Database (all tenants/orders/messages)** | Mac `db/prod.db`+WAL+SHM | HIGH | integrity `ok`; true state 3 users/3 bots/35 customers/32 orders/212 messages |
| **Secrets / `AUTH_SECRET`** | Mac `env/saas.env` + `whatsapp-service.env` | HIGH | decrypts current data + signs sessions |
| **WhatsApp connectivity** | Mac `wa-sessions/` (auth leveldb) **or** QR re-scan | HIGH | restore session; if inconsistent, tenant re-scans QR — no data loss |
| **AI engine (in-house LLM)** | Mac `mse_ai_api-main` + `CloakBrowser-main` | HIGH | needs ChatGPT re-login on new host; `requirements.txt` must add `cloakbrowser` |
| **Historical backups** | Mac `backups/` (14 daily gz) | HIGH | point-in-time recovery across 2 weeks |
| **Reverse proxy + TLS** | GitHub `deploy/Caddyfile` + Caddy auto-ACME | HIGH | certs re-issue automatically once DNS points at new host |
| **Scheduled jobs / services** | GitHub `deploy/*.ps1` (+ extracted `nssm-services.txt`) | HIGH | re-installable |
| **UI work-in-progress** | Mac local branch `claude/hopeful-kowalevski-90a1e7` | MEDIUM | survives *VPS* loss (it's in the Mac's git), but **not on GitHub** |

**Restore path:** stand up Ubuntu/Windows host → clone GitHub → restore DB+env (preserve `AUTH_SECRET`) → restore WA sessions → stage AI engine + cloakbrowser → build → re-point DNS. Full procedure: [DISASTER_RECOVERY](DISASTER_RECOVERY.md) Scenario A (target time < 90 min).

---

## What CANNOT be restored ❌

| Item | Why | Severity |
|---|---|---|
| **Data written after the 10:19 extraction** | the Mac DB is a point-in-time snapshot; the live VPS kept writing until it vanished | **Medium** — lose only the delta (mitigated by a final re-extraction at shutdown) |
| **2 legacy encrypted columns** (`Bot.aiApiKeyEnc`, `Bot.metaAccessTokenEnc`) | encrypted under an older `AUTH_SECRET` not present in any copy | Low — dormant; re-enter in dashboard if ever needed |
| **Live TLS certificate** | held in Caddy data on the VPS (not extracted) | None — Caddy re-issues automatically |
| **ChatGPT login session** (CloakBrowser profile) | not extracted | Low — re-login on the new host |
| **DNS registrar access** | not documented anywhere | **Medium** — without registrar login you cannot re-point `app.keyone1.com` (the domain itself would be the blocker, not the data) |
| **Skipped Chromium cache (~574 MB)** | regenerable browser cache | None |

---

## Estimated recovery success rate

| Scenario | Rate | Rationale |
|---|---|---|
| **VPS gone, Mac intact (this simulation)** | **~95%** | App + DB + secrets + sessions + engine all recoverable from GitHub + Mac. Lose only the post-10:19 data delta + 2 dormant blobs. **Contingent on having DNS registrar access** to re-point the domain. |
| VPS gone **and** Mac also lost | **~40%** | Only GitHub survives → app shell, no data/secrets/engine. This is the single-copy risk. |
| After replication (SSD + encrypted off-site + Git push) | **~98–100%** | No single-machine dependency; engine + UI in Git. |

### The decisive risk
Recovery is **possible today (~95%)** *because the Mac holds verified copies* — but that is a **single copy**. The simulation passes only while the Mac is healthy. The gap between 95% and a durable 98–100% is exactly the replication work (SSD + encrypted off-site + push engine/UI/DR-docs to GitHub) plus capturing the DNS registrar access.

**Conclusion:** Recovery from GitHub + extracted backups + Mac copies is **VALIDATED as possible (~95%)**, with two caveats to close before relying on it: (1) it currently depends on a single machine, and (2) DNS registrar access must be documented.
