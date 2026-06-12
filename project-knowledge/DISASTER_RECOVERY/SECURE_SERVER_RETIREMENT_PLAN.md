# SECURE_SERVER_RETIREMENT_PLAN — KEYONE Windows VPS

**Date:** 2026-06-12
**⚠️ DOCUMENTATION ONLY — DO NOT EXECUTE ANY COMMAND IN THIS FILE.**
These are the exact steps to securely retire `217.154.163.16` once retirement is approved. Nothing here has been run. Per the active safety rules, no service was stopped, no file removed, no secret rotated.

---

## 🚦 PRE-DESTRUCTION GATE — all must be TRUE before step 1

Do **not** begin any destructive step until every box is checked (see [SERVER_RETIREMENT_CHECKLIST](SERVER_RETIREMENT_CHECKLIST.md)):

- [ ] Extraction replicated to **≥ 3 locations**: Mac + external SSD + encrypted off-site
- [ ] `AUTH_SECRET` + env stored in a **password vault** (off-device)
- [ ] **AI engine** (`main.py` + vendored `cloakbrowser`) pushed to a private Git repo
- [ ] **UI branch** `claude/hopeful-kowalevski-90a1e7` + **DR docs** pushed to GitHub
- [ ] **DNS registrar** access documented in the vault
- [ ] A **restore smoke test** succeeded (local KEYONE boots on the extracted DB + `AUTH_SECRET`; a tenant key decrypts; login works)
- [ ] **FINAL fresh DB + sessions re-extraction** taken at shutdown (step 0 below) — the existing copy is a 10:19 snapshot and will be stale

> If any box is unchecked, **STOP** — retiring now risks single-copy data loss. See [FINAL_RECOVERY_STATUS](FINAL_RECOVERY_STATUS.md).

---

## Step 0 — Final fresh extraction (capture the delta) *(read-only)*
```powershell
# From the Mac (as in the prior extraction), pull the freshest state right before shutdown.
# This captures everything written since the 10:19 snapshot.
#   scp prod.db + prod.db-wal + prod.db-shm  -> Mac db-final/
#   scp whatsapp-service/sessions            -> Mac wa-sessions-final/
#   verify: sqlite3 prod.db "PRAGMA integrity_check;"  -> ok
```
Only after step 0 verifies and the gate is green, proceed.

---

## Step 1 — Stop services *(first destructive-prep step)*
```powershell
# Stop in dependency order; do NOT delete service definitions yet.
nssm stop mse-caddy        # stop public traffic first (clean 503)
nssm stop mse-saas
nssm stop mse-wa
# (mse-llm already decommissioned — verify none running)
Get-Service mse-*, caddy | Select Name, Status     # confirm all Stopped
Get-Process node, caddy -ErrorAction SilentlyContinue | Select Id, ProcessName
```

## Step 2 — Archive final logs *(preserve before wiping)*
```powershell
$ts = Get-Date -Format yyyyMMdd-HHmmss
$arch = "C:\app\_retirement-$ts"
New-Item -ItemType Directory -Force $arch | Out-Null
Copy-Item C:\app\logs\*            $arch\app-logs\     -Recurse -Force -EA SilentlyContinue
Copy-Item C:\KEYONE\logs\*         $arch\keyone-logs\  -Recurse -Force -EA SilentlyContinue
Copy-Item C:\app\backups\backup.log $arch\ -Force -EA SilentlyContinue
nssm dump mse-saas  > $arch\nssm-mse-saas.txt
nssm dump mse-wa    > $arch\nssm-mse-wa.txt
nssm dump mse-caddy > $arch\nssm-mse-caddy.txt
schtasks /query /fo LIST /v | Out-File $arch\scheduled-tasks.txt
Compress-Archive $arch "$arch.zip"
# scp "$arch.zip" -> Mac retirement-archive/   (then verify it landed)
```

## Step 3 — Securely remove environment files *(secrets — overwrite, don't just delete)*
```powershell
# Overwrite before delete so AUTH_SECRET cannot be recovered from disk.
$envs = @("C:\app\saas\.env","C:\app\whatsapp-service\.env","C:\app\.env",
          "C:\app\backups\saas-env-before-phase-a-queue-20260522-1010.bak")
foreach ($f in $envs) { if (Test-Path $f) {
  $len=(Get-Item $f).Length; [byte[]]$z=New-Object byte[] $len
  [IO.File]::WriteAllBytes($f,$z); Remove-Item $f -Force } }
# Use sdelete (Sysinternals) for free-space wipe if required:  sdelete64 -p 3 -z C:
```

## Step 4 — Remove databases
```powershell
Remove-Item C:\app\saas\prisma\prod.db, C:\app\saas\prisma\prod.db-wal, C:\app\saas\prisma\prod.db-shm -Force -EA SilentlyContinue
Remove-Item C:\app\saas\prisma\dev.db* -Force -EA SilentlyContinue
Remove-Item C:\app\saas\prisma\*.bak, C:\app\saas\prisma\*.predeploy* -Force -EA SilentlyContinue
# (databases contain all tenant PII — wipe free space afterward with sdelete if disk is reused)
```

## Step 5 — Remove WhatsApp sessions
```powershell
Remove-Item C:\app\whatsapp-service\sessions -Recurse -Force -EA SilentlyContinue
Remove-Item C:\KEYONE\data\wa-sessions       -Recurse -Force -EA SilentlyContinue
# Session data authenticates a real WhatsApp number — treat as sensitive; wipe free space.
```

## Step 6 — Remove backups
```powershell
Remove-Item C:\app\backups -Recurse -Force -EA SilentlyContinue
# (only after confirming all 14 daily gz + snapshots are on Mac+SSD+off-site)
```

## Step 7 — Remove project directories
```powershell
Remove-Item C:\app\saas             -Recurse -Force -EA SilentlyContinue
Remove-Item C:\app\whatsapp-service -Recurse -Force -EA SilentlyContinue
Remove-Item C:\KEYONE               -Recurse -Force -EA SilentlyContinue
Remove-Item C:\Caddy                -Recurse -Force -EA SilentlyContinue   # Caddyfile is in Git
```

## Step 8 — Remove deployment artifacts + services + tasks
```powershell
# Unregister NSSM services
foreach ($s in "mse-saas","mse-wa","mse-caddy") { nssm remove $s confirm }
# Remove scheduled tasks
foreach ($t in "KEYONE-DB-Backup","KEYONE-Broadcasts","KEYONE-Follow-Ups","KEYONE-Automations","KEYONE-Abandoned-Cart") {
  schtasks /delete /tn $t /f }
# Remove releases + any loose deploy artifacts
Remove-Item C:\app\releases -Recurse -Force -EA SilentlyContinue
Remove-Item C:\app\*.tar.gz, C:\app\*.ps1, C:\app\_deploy.ps1 -Force -EA SilentlyContinue
Remove-Item C:\app -Recurse -Force -EA SilentlyContinue
```

## Step 9 — Decommission the host (the real retirement)
```text
For a hosted VPS, in-OS wiping is secondary. The definitive step:
  1. In the Contabo (provider) panel: destroy / cancel the VPS instance.
  2. This deallocates the disk; request secure-erase if the provider offers it.
  3. Remove the server's SSH public key from GitHub Actions secrets (VPS_SSH_KEY/VPS_HOST).
  4. Re-point or release DNS:
       - if migrating: A record app.keyone1.com -> NEW host (do this BEFORE destroy, low TTL)
       - if shutting down: remove the A record so the dead IP stops resolving
  5. Revoke the VPS deploy key from any GitHub repo it could still reach.
```

---

## Post-retirement verification
- [ ] App no longer reachable at the old IP; DNS points to new host (or is removed)
- [ ] GitHub Actions `production` deploy disabled or re-targeted (so it can't deploy to a dead host)
- [ ] Extraction confirmed on Mac + SSD + off-site (3 copies) after the host is gone
- [ ] Vault holds `AUTH_SECRET` + env + DNS + SSH/provider access
- [ ] Engine + UI + DR docs confirmed on GitHub

> **Order matters:** logs → secrets (overwrite) → DB → sessions → backups → project dirs → services/tasks → host destroy. Never remove backups (step 6) before the off-site copy is confirmed. The point of no return is **step 3** (secret overwrite) — everything before it is reversible.
