# ============================================================
#  KEYONE — Production rollback
# ------------------------------------------------------------
#  Restores from a backup snapshot created by backup-all.ps1:
#    1. Stop mse-saas + mse-wa
#    2. Restore SQLite prod.db (and -wal/-shm if present)
#    3. Restore .env files
#    4. Robocopy WA sessions back
#    5. Restore prisma/ directory if present
#    6. (optional) git reset --hard to a target commit
#    7. Rebuild + restart
#    8. Health check
#
#  Usage (elevated PowerShell):
#      .\rollback.ps1                              # uses backups\latest.txt
#      .\rollback.ps1 -Snapshot "C:\app\backups\pre-deploy-2026-05-14_213059"
#      .\rollback.ps1 -GitCommit abc1234           # also reset working copy
#      .\rollback.ps1 -InstallDir "C:\app"         # default
# ============================================================

[CmdletBinding()]
param(
    [string]$InstallDir = "C:\app",
    [string]$Snapshot   = "",
    [string]$GitCommit  = ""
)

$ErrorActionPreference = "Stop"
$Repo = $InstallDir
$Here = $PSScriptRoot
$T0   = Get-Date

$SVC_SAAS = "mse-saas"
$SVC_WA   = "mse-wa"

function Step($n,$msg){
  Write-Host ""
  Write-Host "============================================" -ForegroundColor Magenta
  Write-Host "  STEP $n :: $msg" -ForegroundColor Magenta
  Write-Host "============================================" -ForegroundColor Magenta
}
function Pass($m){ Write-Host "  [OK]   $m" -ForegroundColor Green }
function Warn($m){ Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Info($m){ Write-Host "  [..]   $m" -ForegroundColor DarkGray }
function Abort($reason){
  Write-Host ""
  Write-Host "============================================" -ForegroundColor Red
  Write-Host "  ROLLBACK ABORTED: $reason" -ForegroundColor Red
  Write-Host "============================================" -ForegroundColor Red
  exit 1
}

# Resolve snapshot dir.
if (-not $Snapshot) {
  $ptr = Join-Path $Repo "backups\latest.txt"
  if (-not (Test-Path $ptr)) { Abort "no -Snapshot specified and $ptr not found" }
  $Snapshot = (Get-Content $ptr -ErrorAction Stop).Trim()
}
if (-not (Test-Path $Snapshot)) { Abort "snapshot not found: $Snapshot" }

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  KEYONE rollback" -ForegroundColor Cyan
Write-Host "  Snapshot   : $Snapshot" -ForegroundColor Cyan
Write-Host "  InstallDir : $InstallDir" -ForegroundColor Cyan
if ($GitCommit) { Write-Host "  GitCommit  : $GitCommit" -ForegroundColor Cyan }
Write-Host "============================================" -ForegroundColor Cyan

# Show what's in the snapshot.
Step "0" "Inspect snapshot contents"
Get-ChildItem $Snapshot -Recurse | Select-Object FullName, Length | Format-Table | Out-String | Write-Host

# ----- 1. Stop services -----
Step "1" "Stop mse-saas + mse-wa"
foreach ($svc in @($SVC_SAAS,$SVC_WA)) {
  & nssm stop $svc 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  $global:LASTEXITCODE = 0
}
Start-Sleep -Seconds 4

# ----- 2. Restore SQLite -----
Step "2" "Restore SQLite prod.db"
$dbSrc = Join-Path $Snapshot "saas.db"
$dbDst = "$Repo\saas\prisma\prod.db"
if (-not (Test-Path $dbSrc)) { Abort "snapshot is missing saas.db" }
if (-not (Test-Path "$Repo\saas\prisma")) { Abort "$Repo\saas\prisma missing" }
Copy-Item -LiteralPath $dbSrc -Destination $dbDst -Force
Pass "prod.db restored ($([int]((Get-Item $dbDst).Length/1KB)) KB)"
# Wipe stale wal/shm so SQLite rebuilds them from the restored db on next open
foreach ($side in @("$dbDst-wal","$dbDst-shm")) { if (Test-Path $side) { Remove-Item $side -Force } }

# ----- 3. Restore .env files -----
Step "3" "Restore .env files"
$envDir = Join-Path $Snapshot "env"
if (Test-Path "$envDir\saas.env")              { Copy-Item -LiteralPath "$envDir\saas.env"              -Destination "$Repo\saas\.env"              -Force; Pass "saas/.env restored" }
if (Test-Path "$envDir\whatsapp-service.env")  { Copy-Item -LiteralPath "$envDir\whatsapp-service.env"  -Destination "$Repo\whatsapp-service\.env"  -Force; Pass "whatsapp-service/.env restored" }

# ----- 4. Restore WA sessions -----
Step "4" "Restore WhatsApp sessions"
$waSrc = Join-Path $Snapshot "wa-sessions"
$waDst = "$Repo\whatsapp-service\sessions"
if (Test-Path $waSrc) {
  if (-not (Test-Path $waDst)) { New-Item -ItemType Directory -Path $waDst -Force | Out-Null }
  & robocopy $waSrc $waDst /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null
  Pass "WA sessions mirrored"
} else { Warn "snapshot has no wa-sessions; skipping" }

# ----- 5. Restore prisma directory -----
Step "5" "Restore prisma/ schema + migrations"
$prismaSrc = Join-Path $Snapshot "prisma"
if (Test-Path $prismaSrc) {
  & robocopy $prismaSrc "$Repo\saas\prisma" /E /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null
  Pass "prisma/ mirrored"
}

# ----- 6. Optional git reset -----
if ($GitCommit) {
  Step "6" "git reset --hard $GitCommit"
  Push-Location $Repo
  try {
    & git fetch --quiet
    & git reset --hard $GitCommit
    if ($LASTEXITCODE -ne 0) { Abort "git reset failed" }
    Pass "now at: $(& git rev-parse HEAD)"
  } finally { Pop-Location }
}

# ----- 7. Rebuild -----
Step "7" "prisma generate + next build"
Push-Location "$Repo\saas"
try {
  & npx prisma generate 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  & npm run build       2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  if ($LASTEXITCODE -ne 0) { Abort "build failed after rollback" }
} finally { Pop-Location }

# ----- 8. Start + health -----
Step "8" "Start services + health check"
& nssm start $SVC_SAAS 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
Start-Sleep -Seconds 2
& nssm start $SVC_WA   2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
$global:LASTEXITCODE = 0
Start-Sleep -Seconds 12

if (Test-Path "$Here\health-check.ps1") {
  & "$Here\health-check.ps1" -InstallDir $InstallDir
  if ($LASTEXITCODE -ne 0) { Warn "health-check reported failures; investigate manually" }
}

$dt = [int]((Get-Date) - $T0).TotalSeconds
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  ROLLBACK COMPLETE in ${dt}s" -ForegroundColor Green
Write-Host "  Restored from: $Snapshot" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
