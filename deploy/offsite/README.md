# deploy/offsite — KEYONE off-site encrypted backups

Closes blockers **B1** (no off-site backup) and **B2** (secrets only on the VPS) from the
[Disaster Recovery audit](../../project-knowledge/DISASTER_RECOVERY/FINAL_READINESS_REPORT.md).

> These scripts are **additive and inert** until you schedule them. They only **read + copy** —
> they never modify production, the database, or the WhatsApp pipeline.

## Files
| File | Platform | Purpose |
|---|---|---|
| `backup-offsite.sh` | Linux / Ubuntu (migration target) | bundle → age-encrypt → rclone upload → prune |
| `backup-offsite.ps1` | Windows (current production VPS) | same, Windows-native |
| `restore-offsite.sh` | Linux | list / fetch+decrypt / apply |

## What gets backed up
1. **SQLite database** — online `sqlite3 .backup` snapshot (safe on a live DB).
2. **WhatsApp sessions** — `SESSIONS_DIR` tarball.
3. **Uploads** — included if present (KEYONE currently stores none on disk).
4. **Environment files** — `saas/.env`, `whatsapp-service/.env`, root `.env` (this is why the archive is **encrypted** — they contain `AUTH_SECRET`).
5. **Manifest** — git SHA, timestamps, SHA-256 of every file.

## One-time setup (~30 min)
```bash
# 1. Tools
apt install -y age rclone sqlite3            # Linux
#   Windows: download age.exe + rclone.exe to C:\tools, add to PATH

# 2. Configure a remote (Backblaze B2 / Cloudflare R2 / S3 / Google Drive)
rclone config                                # creates e.g.  b2:keyone-backups

# 3. Generate an encryption keypair OFF the server
age-keygen -o keyone-backup.key              # PRIVATE key -> your password manager
grep 'public key' keyone-backup.key          # the age1… line goes on the server only
```
> The **private** age key must NOT live on the production server — store it in the
> secrets vault (see [SECRETS_INVENTORY_AND_MIGRATION](../../project-knowledge/DISASTER_RECOVERY/SECRETS_INVENTORY_AND_MIGRATION.md)).
> If the server is compromised, the attacker still cannot decrypt the off-site archives.

## Run
```bash
# Linux
AGE_RECIPIENT=age1xxxx RCLONE_REMOTE=b2:keyone-backups \
  ./backup-offsite.sh --tier daily

# Windows (current prod)
pwsh deploy\offsite\backup-offsite.ps1 -AgeRecipient age1xxxx -RcloneRemote b2:keyone-backups -Tier daily
```

## Schedule
**Linux (cron):**
```cron
30 3 * * *  AGE_RECIPIENT=age1xxxx RCLONE_REMOTE=b2:keyone-backups /home/keyone/app/deploy/offsite/backup-offsite.sh --tier daily   >> /var/keyone/logs/offsite.log 2>&1
0  3 * * 0  AGE_RECIPIENT=age1xxxx RCLONE_REMOTE=b2:keyone-backups /home/keyone/app/deploy/offsite/backup-offsite.sh --tier weekly  >> /var/keyone/logs/offsite.log 2>&1
0  2 1 * *  AGE_RECIPIENT=age1xxxx RCLONE_REMOTE=b2:keyone-backups /home/keyone/app/deploy/offsite/backup-offsite.sh --tier monthly >> /var/keyone/logs/offsite.log 2>&1
```
**Windows (Task Scheduler):** run `backup-offsite.ps1` daily 03:50 (after the existing local `backup-db.ps1` at 03:30), weekly Sunday, monthly on the 1st. Wrap with `pwsh -File`.

## Restore
```bash
RCLONE_REMOTE=b2:keyone-backups ./restore-offsite.sh --list daily
AGE_IDENTITY=~/keyone-backup.key RCLONE_REMOTE=b2:keyone-backups \
  ./restore-offsite.sh --fetch keyone-daily-YYYYMMDD-HHMMSS.tar.gz.age
./restore-offsite.sh --apply ./restore/keyone-daily-YYYYMMDD-HHMMSS
```

## Retention (default)
| Tier | Keep |
|---|---|
| daily | 30 days |
| weekly | 8 weeks |
| monthly | 12 months |

Tune via env (`RETAIN_DAILY`, …) or the `.ps1` params. Best practice: also set an
**immutable / object-lock** bucket policy on the remote so backups can't be deleted by a
compromised server key.

## Test it
Run a **monthly restore drill**: fetch the newest archive to a scratch box, decrypt,
`PRAGMA integrity_check`, and confirm `SELECT COUNT(*) FROM User` is sane. A backup you
have never restored is not a backup.
