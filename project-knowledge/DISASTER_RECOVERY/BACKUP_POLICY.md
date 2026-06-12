# BACKUP_POLICY — KEYONE

**Date:** 2026-06-12
**Goal:** a 3-2-1 backup policy that survives total VPS loss. Covers database, WhatsApp sessions, environment/secrets, and application code, with daily/weekly/monthly tiers and retention.

> **Why this matters:** today **all backups are written to `C:\app\backups` on the same VPS disk** as production. A single disk/VPS loss destroys production **and** every backup simultaneously. This policy's #1 objective is to get a copy **off** the VPS.

---

## 1. What must be backed up

| Asset | Source | In Git? | Recoverable without backup? |
|---|---|---|---|
| **SQLite database** | `saas.db` (`DATABASE_URL`) | ❌ | ❌ No |
| **WhatsApp sessions** | `SESSIONS_DIR/.wwebjs_auth/` | ❌ | ⚠️ Only via per-tenant QR re-scan |
| **Environment / secrets** | `saas/.env`, `whatsapp-service/.env`, root `.env` (esp. `AUTH_SECRET`) | ❌ | ❌ No |
| **Application code** | Git repo | ✅ | ✅ Yes (GitHub) |
| **CloakBrowser LLM source** | `mse_ai_api` / `main.py` | ❌ **not in Git** | ❌ No — must be backed up like a secret until committed |
| **DNS/registrar access** | external | ❌ | ❌ document in vault |

Uploads: **none** — KEYONE stores no user binaries on disk (knowledge/media are parsed to text into the DB). No upload tree to back up.

---

## 2. 3-2-1 target

- **3** copies of data: production + local VPS backup + **off-site** copy.
- **2** media types / locations: VPS disk + remote object storage (S3/B2/R2) or a separate machine.
- **1** copy off-site: the missing piece today. **This is the top priority action.**

---

## 3. Backup schedule & retention

| Tier | What | Frequency | Retention | Tooling |
|---|---|---|---|---|
| **Hourly** *(recommended new)* | DB only | every 1h | 48 hours | `sqlite3 .backup` + gzip → off-site |
| **Daily** | DB (gzip) | 03:30 | **14 days** *(current)* → keep at 14–30 days | `deploy/backup-db.ps1` (`KEYONE-DB-Backup`) |
| **Daily** *(recommended new)* | WhatsApp sessions + `.env` | 03:40 | 7 days | `robocopy`/`rsync` of `SESSIONS_DIR` + env → off-site |
| **Weekly** | Full snapshot: DB + sessions + env + prisma | Sunday 03:00 | 8 weeks | `deploy/backup-all.ps1` + off-site upload |
| **Monthly** | Full snapshot, archived | 1st of month | 12 months | weekly snapshot promoted to cold storage |
| **Per-deploy** | Full snapshot (rollback) | every deploy | last 10 (manual prune) | `backup-all.ps1` (auto-triggered by deploy scripts) |
| **Verify** | Validate newest DB backup | daily 04:00 | n/a | `deploy/verify-backup.ps1` |

**RPO target:** ≤ 1 hour (with hourly DB backups) — today it is effectively ~24h (daily only).
**RTO target:** ≤ 90 min for full server rebuild (see [DISASTER_RECOVERY](DISASTER_RECOVERY.md) Scenario A).

---

## 4. Current state vs. required

| Capability | Current | Required |
|---|---|---|
| Daily DB backup | ✅ `backup-db.ps1`, 14d, gzip, online `.backup` | keep |
| Backup verification | ✅ `verify-backup.ps1` (integrity + row counts + recency) | keep, schedule daily |
| Pre-deploy full snapshot | ✅ `backup-all.ps1` (DB+sessions+env+prisma) | keep; add auto-pruning |
| **Off-site copy** | ❌ none — all on VPS disk | **ADD — top priority** |
| Scheduled session backup | ⚠️ only at deploy time | add daily session backup |
| Secrets backup | ⚠️ implicit in `backup-all` (still on VPS) | store `.env` + `AUTH_SECRET` in an off-VPS secrets vault |
| LLM proxy source backup | ❌ none in this repo | commit to a private repo (see [GITHUB_COMPLETENESS_AUDIT](GITHUB_COMPLETENESS_AUDIT.md) M1) |
| Encryption at rest (off-site) | n/a | encrypt off-site archives (they contain `.env` + DB) |

---

## 5. Recommended off-site implementation

Minimal, additive — does **not** touch the send pipeline or the app:

```bash
# Example: nightly off-site push to S3-compatible storage (B2 / R2 / S3).
# Run AFTER backup-db.ps1 (03:30) / backup-all.ps1.
# Encrypt because the archive contains .env (AUTH_SECRET) and the DB.

# 1. Bundle the newest snapshot
tar czf /tmp/keyone-$(date +%F).tar.gz -C C:/app/backups <newest-snapshot>

# 2. Encrypt (age or gpg) — keep the recipient key OFF the VPS
age -r <age-pubkey> -o /tmp/keyone-$(date +%F).tar.gz.age /tmp/keyone-$(date +%F).tar.gz

# 3. Upload off-site (rclone supports B2/R2/S3/Drive)
rclone copy /tmp/keyone-$(date +%F).tar.gz.age remote:keyone-backups/

# 4. Apply remote retention (e.g. rclone lifecycle / bucket rule): 30 daily, 8 weekly, 12 monthly
```
On Windows today, wrap this in a `backup-offsite.ps1` invoked by a new scheduled task at 03:50. On Ubuntu, a `keyone-backup.timer` (see [UBUNTU_MIGRATION_PLAN](UBUNTU_MIGRATION_PLAN.md) §2) runs the same steps.

**Secrets vault (separate from archives):** store `AUTH_SECRET`, `SAAS_INTERNAL_SECRET`, `WHATSAPP_SHARED_SECRET`, `LLM_API_KEY`, `OPENAI_API_KEY`, `META_*`, `UPSTASH_*`, and DNS registrar logins in a password manager (1Password/Bitwarden) held off the VPS. This is what makes a DB restore actually usable.

---

## 6. Restore testing (don't trust an untested backup)

| Test | Frequency | Pass criteria |
|---|---|---|
| `verify-backup.ps1` on newest DB | daily | exit 0; integrity ok; `User`/`Bot` counts > 0; < 26h old |
| Off-site restore drill | monthly | download → decrypt → `PRAGMA integrity_check` = ok on a scratch box |
| Full DR rehearsal | quarterly | stand up a throwaway VPS, restore DB+secrets+LLM, `/api/health` = ok, send a test message |
| `AUTH_SECRET` decrypt check | monthly | a known `Bot.aiApiKeyEnc` decrypts with the backed-up secret |

---

## 7. Policy summary

1. **Keep current daily DB backup + verification** (they are good).
2. **Add an encrypted off-site copy** of DB + sessions + secrets — this is the single change that converts "VPS loss = total loss" into "VPS loss = ≤1–24h loss."
3. **Back up the LLM proxy source** (or commit it) so the AI engine is recoverable.
4. **Store secrets + DNS access in an off-VPS vault.**
5. **Test restores** monthly; full DR drill quarterly.
6. **Retention:** 48h hourly · 14–30d daily · 8w weekly · 12m monthly.
