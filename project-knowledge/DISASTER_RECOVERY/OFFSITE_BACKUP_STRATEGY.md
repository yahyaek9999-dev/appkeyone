# OFFSITE_BACKUP_STRATEGY — KEYONE

**Date:** 2026-06-12
**Blockers addressed:** **B1** (no off-site backup) and partially **B2** (secrets off the VPS).
**Deliverable:** runnable scripts in [`deploy/offsite/`](../../deploy/offsite/) + this strategy. No production change, no deploy.

---

## 1. Problem (from the audit)

Today **every backup writes to `C:\app\backups` on the production disk**. The disaster scenario — "the VPS disappears permanently" — therefore takes production **and** its backups together. There is **no copy off the server**. This is the single biggest reason the readiness verdict is currently NO.

## 2. Solution shape

A **pull-nothing, push-encrypted** model:

```
Production VPS                         Off-site object storage (B2 / R2 / S3)
┌──────────────────────┐   age-encrypt   ┌──────────────────────────────┐
│ sqlite3 .backup  ────▶│  + rclone push  │ daily/   (30d retention)     │
│ wa-sessions tarball ─▶│ ───────────────▶│ weekly/  (8w)   immutable    │
│ env files (AUTH_*)  ─▶│                 │ monthly/ (12m)  object-lock  │
└──────────────────────┘                 └──────────────────────────────┘
        PUBLIC age key only on server          PRIVATE age key in vault (off-server)
```

- **Encryption (age):** only the **public** key sits on the server. A compromised server cannot read its own off-site archives. The **private** key lives in the secrets vault.
- **Transport (rclone):** provider-agnostic — Backblaze B2 (cheapest), Cloudflare R2 (no egress fees), AWS S3, or even Google Drive.
- **Immutability:** enable bucket **object-lock / versioning** so a compromised server key can upload but **cannot delete or overwrite** history.

## 3. What is backed up (and why each)

| Asset | Why | Source path (configurable) |
|---|---|---|
| SQLite DB | all tenant data — irreplaceable | `KEYONE_DB_PATH` |
| WhatsApp sessions | avoids per-tenant QR re-scan | `KEYONE_WA_SESSIONS_DIR` |
| Uploads | future-proof (KEYONE stores none today) | `KEYONE_UPLOADS_DIR` (skipped if empty) |
| Env files | hold `AUTH_SECRET` → without it a DB restore is useless | `KEYONE_ENV_FILES` |
| Manifest | provenance + integrity (git SHA, SHA-256) | generated |

> Application **code** and the **LLM engine** are NOT in this archive — they belong in Git
> (see [AI_ENGINE_SOURCE_INVENTORY](AI_ENGINE_SOURCE_INVENTORY.md) for committing the engine).

## 4. Schedule & retention (3-2-1)

| Tier | Frequency | Retention | Command |
|---|---|---|---|
| Daily | 03:50 (after local 03:30 DB backup) | 30 days | `backup-offsite.* --tier daily` |
| Weekly | Sunday 03:00 | 8 weeks | `… --tier weekly` |
| Monthly | 1st of month 02:00 | 12 months | `… --tier monthly` |

**3-2-1 achieved:** 3 copies (live + local VPS backup + off-site), 2 locations (VPS disk + cloud), 1 off-site.
**RPO** improves from ~24h → as low as the most frequent tier (run the daily job hourly if needed — the script is idempotent). **RTO** unchanged (~90 min full rebuild) but now actually *possible*.

## 5. Exact actions + effort

| # | Action | Effort | Risk |
|---|---|---|---|
| O1 | Install `age` + `rclone` (+ `sqlite3`) on the VPS | 10 min | none (read-only tools) |
| O2 | Create an off-site bucket (B2/R2/S3) + `rclone config` remote | 15 min | none |
| O3 | Generate the age keypair off-server; store private key in vault; put public key on server | 10 min | none |
| O4 | Dry-run `backup-offsite.*` once manually; confirm upload + `rclone check` | 10 min | none (no prod change) |
| O5 | Enable bucket object-lock / versioning (immutability) | 15 min | none |
| O6 | Schedule daily/weekly/monthly (cron or Task Scheduler) | 15 min | none |
| O7 | Run a **restore drill** to a scratch box (decrypt + integrity_check) | 30 min | none |
| O8 | Document the remote name + bucket + key location in the runbook/vault | 10 min | none |

**Total effort: ~2 hours.** All additive; nothing deployed to the app; the WhatsApp send pipeline is untouched.

## 6. Validation checklist

- [ ] A `*.tar.gz.age` object appears in the remote `daily/` prefix after the first run
- [ ] `rclone check` passes (local == remote)
- [ ] The archive **cannot** be decrypted without the vault private key (try without it — should fail)
- [ ] Restore drill: decrypt → `PRAGMA integrity_check` = `ok` → `SELECT COUNT(*) FROM User` sane
- [ ] Retention prune runs (old daily objects disappear after 30d)
- [ ] Object-lock prevents deletion by the server's rclone credential
- [ ] Schedule fires (check `offsite.log` next morning)

## 7. Cost (order of magnitude)

A KEYONE SQLite DB + sessions is small (tens–hundreds of MB). At B2/R2 pricing (~$5–6/TB-month) the entire retention set costs **well under $1/month**. Cost is not a blocker; the only cost is the ~2 hours of setup.
