# FINAL_SHUTDOWN_RUNBOOK — KEYONE

**Date:** 2026-06-12
**⚠️ DOCUMENTATION ONLY — DO NOT EXECUTE NOW.** This runs **immediately before** the VPS is shut down/retired, to capture the data delta written since the 2026-06-12 10:19 extraction. No step here has been run; services are untouched.

**Why this exists:** the existing extraction is a point-in-time snapshot. While the server runs, the live DB keeps changing (new messages/orders). A final quiesce-and-pull guarantees zero data loss at retirement.

Run from the Mac: `KEY=~/.ssh/id_ed25519  VPS=Administrator@217.154.163.16`. Land into a fresh `FINAL=~/Desktop/KEYONE_EOL_FINAL`.

---

## Step 0 — Pre-flight (read-only)
```bash
mkdir -p ~/Desktop/KEYONE_EOL_FINAL/{db,wa-sessions,logs}
ssh -i "$KEY" "$VPS" "hostname"                         # expect WIN-EMAA6SD4335
# Confirm the gate in SECURE_SERVER_RETIREMENT_PLAN is green BEFORE proceeding.
```

## Step 1 — Stop writes (begins retirement; this is the intended service stop)
```powershell
# (a) Disable the cron-style scheduled tasks so no background writes occur
foreach ($t in "KEYONE-DB-Backup","KEYONE-Broadcasts","KEYONE-Follow-Ups","KEYONE-Automations","KEYONE-Abandoned-Cart") {
  schtasks /change /tn $t /disable }
# (b) Stop inbound WhatsApp (no new messages -> no new DB writes)
nssm stop mse-wa
# (c) Stop the app last so a clean shutdown checkpoints the SQLite WAL into the main file
nssm stop mse-saas
Start-Sleep 3
Get-Service mse-saas, mse-wa | Select Name, Status      # expect Stopped
# Leave mse-caddy running (it just serves 502 now) OR stop it to take the site down:
# nssm stop mse-caddy
```
> A clean `mse-saas` stop lets Prisma/SQLite checkpoint the WAL, so `prod.db` becomes self-contained. The runbook still copies the WAL/SHM in case any remains.

## Step 2 — Pull the latest database (consistent, post-quiesce)
```bash
scp -i "$KEY" -o LogLevel=ERROR "$VPS:C:/app/saas/prisma/prod.db"     ~/Desktop/KEYONE_EOL_FINAL/db/
scp -i "$KEY" -o LogLevel=ERROR "$VPS:C:/app/saas/prisma/prod.db-wal" ~/Desktop/KEYONE_EOL_FINAL/db/ 2>/dev/null || true
scp -i "$KEY" -o LogLevel=ERROR "$VPS:C:/app/saas/prisma/prod.db-shm" ~/Desktop/KEYONE_EOL_FINAL/db/ 2>/dev/null || true
# Belt & suspenders: a fresh online logical dump (zero-write on VPS; needs sqlite3.exe)
ssh -i "$KEY" "$VPS" "sqlite3 C:/app/saas/prisma/prod.db .dump" > ~/Desktop/KEYONE_EOL_FINAL/db/prod.final.dump.sql 2>/dev/null || true
```

## Step 3 — Pull the latest WhatsApp sessions
```bash
scp -r -i "$KEY" -o LogLevel=ERROR "$VPS:C:/app/whatsapp-service/sessions" ~/Desktop/KEYONE_EOL_FINAL/wa-sessions/
```

## Step 4 — Verify checksums + integrity (must pass before shutdown)
```bash
cd ~/Desktop/KEYONE_EOL_FINAL
shasum -a 256 db/prod.db db/prod.db-wal db/prod.db-shm 2>/dev/null | tee FINAL.sha256
# integrity + counts on a working copy (keep originals pristine)
mkdir -p _v && cp db/prod.db db/prod.db-wal db/prod.db-shm _v/ 2>/dev/null
sqlite3 _v/prod.db "PRAGMA integrity_check;"                       # expect: ok
sqlite3 _v/prod.db "SELECT 'User='||COUNT(*),'Bot='||COUNT(*) FROM User,Bot;" 2>/dev/null
sqlite3 _v/prod.db "SELECT 'Customer='||COUNT(*) FROM Customer; SELECT 'Order='||COUNT(*) FROM \"Order\"; SELECT 'Message='||COUNT(*) FROM Message;"
rm -rf _v
# Compare against the 10:19 baseline to confirm the delta was captured:
echo "baseline 10:19 -> User 3 / Bot 3 / Customer 35 / Order 32 / Message 212"
# session auth store present?
find wa-sessions -path "*Default/IndexedDB/https_web.whatsapp.com*" -name "*.ldb" | head -1 && echo "WA auth present"
# nothing truncated
find . -type f -size 0 -print
```
**Pass criteria:** `integrity_check=ok`, counts ≥ baseline (or explained), WA auth leveldb present, no 0-byte files.

## Step 5 — Replicate the final pull (3-2-1) before teardown
```bash
tar czf ~/Desktop/KEYONE_EOL_FINAL/keyone-final.tar.gz -C ~/Desktop/KEYONE_EOL_FINAL db wa-sessions
age -r <agePub> -o ~/Desktop/KEYONE_EOL_FINAL/keyone-final.tar.gz.age ~/Desktop/KEYONE_EOL_FINAL/keyone-final.tar.gz && rm ~/Desktop/KEYONE_EOL_FINAL/keyone-final.tar.gz
rclone copy ~/Desktop/KEYONE_EOL_FINAL/keyone-final.tar.gz.age b2:keyone-backups/eol-final/   # off-site
cp -R ~/Desktop/KEYONE_EOL_FINAL /Volumes/<SSD>/KEYONE_EOL_FINAL                               # SSD
```

## Step 6 — Hand off to teardown
Only after Step 4 passes **and** Step 5 produces SSD + off-site copies → proceed to
[SECURE_SERVER_RETIREMENT_PLAN](SECURE_SERVER_RETIREMENT_PLAN.md) (archive logs → wipe → destroy host) and
[DNS_REGISTRAR_RECOVERY](DNS_REGISTRAR_RECOVERY.md) §4 (re-point or remove the A record at Hostinger).

---

## Abort conditions (do NOT shut down if any are true)
- `integrity_check` ≠ `ok`, or counts unexpectedly **below** baseline (possible data loss/corruption)
- WA auth leveldb missing from the final pull
- SSD or off-site copy not confirmed
- Final pull not yet checksum-verified

> If aborting, restart services (`nssm start mse-saas; nssm start mse-wa; schtasks /change /enable`) and investigate — the server stays alive.
