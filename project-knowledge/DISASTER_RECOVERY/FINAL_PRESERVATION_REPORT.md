# FINAL_PRESERVATION_REPORT — KEYONE EOL Extraction

**Date:** 2026-06-12 · **Assumption:** the VPS expires within ~6 hours · **Mode:** documentation & verification only — nothing deleted, restarted, deployed, or modified.

> Read-only discovery was performed on the **owner's Mac** (verified local state + GitHub push state) and against the **repo's deploy scripts** (authoritative VPS layout). The VPS filesystem itself was not accessed; live paths are confirmed in [EXPORT_COMMANDS](EXPORT_COMMANDS.md) step 0.

---

## 1. Everything that MUST be copied before expiration

Priority order (full commands in [EXPORT_COMMANDS](EXPORT_COMMANDS.md)):

| P | Asset | VPS path | Why irreplaceable |
|---|---|---|---|
| **P0** | Production database | `C:\KEYONE\data\saas.db` (+`-wal`,`-shm`) **and** `C:\app\saas\prisma\prod.db` **and** newest `C:\app\backups\prod-*.db.gz` | all tenants/orders/messages; **no copy exists off the VPS** |
| **P0** | Prod env files (**AUTH_SECRET**) | `C:\app\saas\.env`, `C:\app\whatsapp-service\.env`, `C:\app\.env` | master key that decrypts every tenant AI/Meta/SMTP secret |
| **P1** | WhatsApp sessions | `C:\KEYONE\data\wa-sessions\` | live device links; avoids per-tenant QR re-scan |
| **P1** | Local backups | `C:\app\backups\` | historical snapshots |
| **P2** | Caddy config + certs | `C:\Caddy\Caddyfile` + Caddy data | avoid ACME re-issue delay (else auto-regenerates) |
| **P2** | NSSM defs + task XML + logs + ChatGPT profile | various | re-creatable from Git scripts / re-login |

**P0 footprint ≈ < 250 MB (minutes to copy). P0+P1 ≈ < 2 GB.**

---

## 2. Anything NOT stored in GitHub

| Item | Where it is | Action |
|---|---|---|
| **Production database** | VPS only | extract (P0) — never goes to Git |
| **Production secrets / `AUTH_SECRET`** | VPS only (+ stale Mac copies) | extract (P0) → vault, encrypted; never to Git |
| **WhatsApp sessions** | VPS only | extract (P1) |
| **Local backups** | VPS only | extract (P1) |
| **AI engine source** (`mse_ai_api/main.py`) | Mac only (`~/Desktop/mse_ai_api-main`) | **commit to private `keyone-llm-proxy` repo** |
| **CloakBrowser** (`cloakbrowser` v0.3.26) | Mac only (`~/Desktop/CloakBrowser-main`) | vendor + commit (not on PyPI) |
| **Local UI branch** `claude/hopeful-kowalevski-90a1e7` (3 commits) | Mac only | `git push origin <branch>` |
| **This DR package + `deploy/offsite/` + `UIUX_POLISH_PASS`** | Mac working tree | commit + push |

## 3. Anything NOT stored locally (Mac)

| Item | Status | Action |
|---|---|---|
| **Production database** | **NOT on Mac** (only `dev.db` found) | extract from VPS (P0) — **highest risk item** |
| **Live production `.env`** | only stale/dev copies on Mac | extract live files (P0) |
| **WhatsApp sessions** | not on Mac | extract (P1) |
| **Local backup archives** | not on Mac | extract (P1) |
| GitHub Actions secrets (`VPS_SSH_KEY`, etc.) | in GitHub repo settings, not on Mac | re-settable; document in vault |

## 4. Anything NOT backed up (anywhere)

| Item | Reality |
|---|---|
| **Off-site backups** | **None exist.** `deploy/offsite/` scripts are written but never scheduled. The live extraction is the *only* path to an off-VPS copy right now. |
| **Production DB off the VPS** | Zero copies until P0 runs. |
| **`AUTH_SECRET` in a vault** | Not yet (only on the VPS + possibly a stale Mac `.env`). |

---

## 5. Estimated recovery success rate if the server disappears

### Scenario A — server disappears **NOW** (before any extraction)
| Layer | Recoverable? | Source |
|---|---|---|
| Application code / infra | ✅ ~100% | GitHub + Mac |
| AI engine | ✅ ~100% | Mac copies |
| **Production data (DB)** | ❌ **0%** | no copy exists |
| **Master secret `AUTH_SECRET`** | ⚠️ ~30% | only a stale May-12 Mac `.env` *might* match if never rotated |
| WhatsApp sessions | ❌ 0% (QR re-scan possible) | VPS only |

**Weighted business-recovery success ≈ 35–40%** — you'd relaunch the *app* but with **no customers, orders, or history**. Effectively a clean reinstall. **Unacceptable.**

### Scenario B — server disappears **after P0 + verify** (DB + env extracted & checked)
**≈ 90%** — all data + master secret preserved; WhatsApp needs QR re-scan; certs/services re-created from Git.

### Scenario C — server disappears **after P0 + P1 + verify** (full extraction)
**≈ 98–100%** — DB, secrets, sessions, and backups all preserved off-server (Mac + SSD + encrypted off-site). Recovery = stand up a new VPS via [DISASTER_RECOVERY](DISASTER_RECOVERY.md) Scenario A in < 90 min.

---

## 6. The 6-hour action list (do in order)

1. **[15 min] Run P0** — copy DB (all candidates) + the three `.env` files to the Mac.
2. **[10 min] Verify** — `PRAGMA integrity_check` = ok, `User`/`Bot` counts sane, `AUTH_SECRET` present + decrypts a known `Bot.aiApiKeyEnc`.
3. **[20 min] Run P1** — copy `wa-sessions` + `backups`.
4. **[15 min] Triplicate the critical set** — Mac + external SSD + **encrypted** off-site (`age` + `rclone`).
5. **[15 min] Push local-only Mac assets to GitHub** — UI branch, DR docs, and the new `keyone-llm-proxy` engine repo.
6. **[10 min] Restore smoke test** — boot a local KEYONE against the extracted DB + `AUTH_SECRET`; confirm login + a decrypted tenant key.
7. **Only then** consult [SERVER_DELETION_READINESS](SERVER_DELETION_READINESS.md) — when every gate checkbox is ticked, deletion is safe.
8. **If you can't finish in time → renew/extend the VPS.** A few dollars beats a 35% recovery rate.

---

## 7. Verdict

> **Do NOT delete or let the VPS expire yet.** ~60% of business-critical recoverability (the production data + master secret) currently lives **only on the VPS** with no off-server copy. Running the P0+P1 extraction in [EXPORT_COMMANDS](EXPORT_COMMANDS.md) — under ~1 hour of work, < 2 GB — raises recovery from **~35% to ~98–100%**. Preserve first; delete only after the verification gate passes.

---

### EOL extraction package (this set)
[SERVER_INVENTORY](SERVER_INVENTORY.md) · [RECOVERY_ASSETS_AUDIT](RECOVERY_ASSETS_AUDIT.md) · [DATA_PRESERVATION_PLAN](DATA_PRESERVATION_PLAN.md) · [EXPORT_COMMANDS](EXPORT_COMMANDS.md) · [SERVER_DELETION_READINESS](SERVER_DELETION_READINESS.md) · FINAL_PRESERVATION_REPORT
