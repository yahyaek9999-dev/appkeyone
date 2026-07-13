# Production database backups — `keyone-dbbackup.timer`

Brought into version control 2026-07-13 after discovering there was **no
backup mechanism at all** for the production Postgres database.

## Background: the migration gap

`deploy/backup-db.ps1`, `backup-all.ps1`, `install-backup-task.ps1`, and
`verify-backup.ps1` are PowerShell scripts left over from the retired
Windows VPS (SQLite `prod.db`) — see `project-knowledge/DEPLOYMENT_RULES.md`.
They cannot run on the current Ubuntu/Postgres box at all. When production
moved to AWS Linux + Postgres, nothing replaced them: confirmed via
`crontab -l` (empty) and `systemctl list-timers --all` (no backup-related
timer) that the production database had zero backup coverage of any kind.
The database is currently small (~7.5MB), so this had not yet caused
customer-visible harm, but a bad migration, an accidental `DELETE`, or an
application bug could have destroyed all customer data with no way back.

## What this adds

`backup-db.sh` (this directory) runs nightly via `keyone-dbbackup.timer`:
1. `pg_dump` the production database in custom format (`-Fc`, compressed,
   selectively restorable) to `~/backups/postgres/keyone-<UTC timestamp>.dump`.
2. Verifies the dump isn't corrupt via `pg_restore --list` (parses the
   archive table of contents without actually restoring anything) —
   deletes the file and fails loudly if the check fails, rather than
   silently keeping a broken backup.
3. Prunes backups older than 14 days.

Reads `POSTGRES_URL` straight from `~/keyone/.env` at run time — no
credentials duplicated into the script or unit files.

## Known gap: no off-site copy

This IAM user (`keyone`, account `540039093726`) has no `s3:CreateBucket` or
`s3:PutObject` permission — confirmed via a direct `aws s3api create-bucket`
attempt (AccessDenied) during the backup-gap investigation. These backups
live on the same EC2 instance as the database; if the instance or its disk
is lost, the backups are lost with it. This protects against the far more
common failure modes (bad migration, accidental delete, app bug) but is
**not** disaster-recovery-complete. To close the gap: grant the `keyone` IAM
user `s3:PutObject`/`s3:CreateBucket` scoped to a dedicated backup bucket,
then add an `aws s3 cp "$OUT" s3://<bucket>/` line to `backup-db.sh` after
the integrity check — no other change needed.

## Deploying to the server

```bash
scp -i ~/Downloads/keyone.pem deploy/backup/backup-db.sh ubuntu@13.63.79.43:~/backup-db.sh
ssh -i ~/Downloads/keyone.pem ubuntu@13.63.79.43 'chmod +x ~/backup-db.sh'
# then create the two unit files from systemd-unit-files.txt under
# /etc/systemd/system/, and:
sudo systemctl daemon-reload
sudo systemctl enable --now keyone-dbbackup.timer
```

## Verifying a backup restores

```bash
pg_restore --list ~/backups/postgres/keyone-<stamp>.dump   # structural check, already run automatically
# full restore test (into a throwaway db, never production):
createdb keyone_restore_test
pg_restore -d keyone_restore_test ~/backups/postgres/keyone-<stamp>.dump
```
