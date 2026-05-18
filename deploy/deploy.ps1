# ============================================================
#  KEYONE — Production deploy orchestrator (canonical, v2)
# ------------------------------------------------------------
#  Single, end-to-end deploy pipeline:
#    0. Pre-flight (paths, NSSM services exist, git OK)
#    1. Backup           (DB + WA sessions + .env + prisma)
#    2. (optional) git fetch + reset to target
#    3. Stop mse-saas + mse-wa  (releases Prisma DLL lock)
#    4. npm ci             (only if package*.json changed)
#    5. prisma generate + prisma db push (additive only)
#    6. next build
#    7. Start mse-saas + mse-wa
#    8. Health check
#
#  On any failure, prints the rollback command and exits non-zero.
#  This script NEVER deletes data; backup is the safety net.
#
#  Usage (elevated PowerShell):
#      .\deploy.ps1                       # standard deploy from current source tree
#      .\deploy.ps1 -GitPull              # also `git fetch && git pull --ff-only`
#      .\deploy.ps1 -SkipBackup           # NOT recommended; only on retry
#      .\deploy.ps1 -InstallDir "C:\app"  # default
# ============================================================

[CmdletBinding()]
param(
    [string]$InstallDir = "C:\app",
    [switch]$GitPull,
    [switch]$SkipBackup
)

$ErrorActionPreference = "Stop"
$Repo = $InstallDir
$Here = $PSScriptRoot
$T0   = Get-Date

# Real NSSM service names on this VPS.
$SVC_SAAS  = "mse-saas"
$SVC_WA    = "mse-wa"
$SVC_LLM   = "mse-llm"
$SVC_CADDY = "mse-caddy"

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
  Write-Host "  DEPLOY ABORTED: $reason" -ForegroundColor Red
  Write-Host "  To roll back: .\rollback.ps1 -InstallDir $InstallDir" -ForegroundColor Yellow
  Write-Host "============================================" -ForegroundColor Red
  exit 1
}

function Stop-AppService($name){
  Info "stopping $name"
  & nssm stop $name 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  $global:LASTEXITCODE = 0
  Start-Sleep -Seconds 3
  $s = Get-Service -Name $name -ErrorAction SilentlyContinue
  if (-not $s) { Abort "service $name not registered" }
  if ($s.Status -ne 'Stopped') { Warn "$name status=$($s.Status); continuing anyway" }
}
function Start-AppService($name){
  Info "starting $name"
  & nssm start $name 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  $global:LASTEXITCODE = 0
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  KEYONE deploy (v2)" -ForegroundColor Cyan
Write-Host "  InstallDir : $InstallDir" -ForegroundColor Cyan
Write-Host "  GitPull    : $GitPull" -ForegroundColor Cyan
Write-Host "  SkipBackup : $SkipBackup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# ----- 0. Pre-flight -----
Step "0" "Pre-flight"
if (-not (Test-Path $Repo))                    { Abort "Install dir $Repo not found" }
if (-not (Test-Path "$Repo\saas"))             { Abort "$Repo\saas not found" }
if (-not (Test-Path "$Repo\whatsapp-service")) { Abort "$Repo\whatsapp-service not found" }
foreach ($svc in @($SVC_SAAS,$SVC_WA,$SVC_LLM,$SVC_CADDY)) {
  $s = Get-Service -Name $svc -ErrorAction SilentlyContinue
  if (-not $s) { Abort "NSSM service '$svc' not registered" } else { Pass "$svc present ($($s.Status))" }
}
$gitOk = $false
try { $head = & git -C $Repo rev-parse HEAD 2>$null; if ($head) { $gitOk = $true; Pass "git HEAD: $head" } } catch {}
if (-not $gitOk -and $GitPull) { Abort "-GitPull requested but $Repo is not a git working copy" }

# ----- 1. Backup -----
if (-not $SkipBackup) {
  Step "1" "Backup (DB + WA sessions + .env + prisma)"
  & "$Here\backup-all.ps1" -InstallDir $InstallDir
  if ($LASTEXITCODE -ne 0) { Abort "backup-all.ps1 failed (exit $LASTEXITCODE)" }
} else {
  Warn "-SkipBackup specified; rollback will fall back to PREVIOUS snapshot"
}

# ----- 2. (optional) Git pull -----
if ($GitPull) {
  Step "2" "git fetch + pull --ff-only"
  Push-Location $Repo
  try {
    & git fetch --quiet
    & git pull --ff-only
    if ($LASTEXITCODE -ne 0) { Abort "git pull failed (non-fast-forward or conflict)" }
    Pass "now at: $(& git -C $Repo rev-parse HEAD)"
  } finally { Pop-Location }
}

# ----- 3. Stop saas + wa (Prisma DLL lock) -----
Step "3" "Stop mse-saas + mse-wa"
Stop-AppService $SVC_SAAS
Stop-AppService $SVC_WA

# ----- 4. npm ci only if package files changed since last deploy -----
Step "4" "Detect package changes"
$saasPkgChanged = $true
$waPkgChanged   = $true
if ($gitOk) {
  # If we are inside a git repo, compare HEAD@{1}..HEAD; if no reflog entry yet (fresh clone), assume changed.
  try {
    $diff = & git -C $Repo diff --name-only "HEAD@{1}" HEAD 2>$null
    if ($diff) {
      $saasPkgChanged = $diff | Select-String -SimpleMatch "saas/package" -Quiet
      $waPkgChanged   = $diff | Select-String -SimpleMatch "whatsapp-service/package" -Quiet
    } else {
      # No diff (no previous deploy or same HEAD) → skip npm ci for speed.
      $saasPkgChanged = $false; $waPkgChanged = $false
    }
  } catch { }
}
if ($waPkgChanged) {
  Info "whatsapp-service: npm ci"
  Push-Location "$Repo\whatsapp-service"
  try { & npm ci --no-audit --no-fund | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray } }
  finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { Abort "npm ci failed in whatsapp-service" }
} else { Info "whatsapp-service: no package change; skip npm ci" }

if ($saasPkgChanged) {
  Info "saas: npm ci"
  Push-Location "$Repo\saas"
  try { & npm ci --no-audit --no-fund | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray } }
  finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { Abort "npm ci failed in saas" }
} else { Info "saas: no package change; skip npm ci" }

# ----- 5. Prisma generate + db push (additive only; never --accept-data-loss) -----
Step "5" "Prisma generate + db push"
Push-Location "$Repo\saas"
try {
  & npx prisma generate 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  if ($LASTEXITCODE -ne 0) { Abort "prisma generate failed" }
  & npx prisma db push 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  if ($LASTEXITCODE -ne 0) { Abort "prisma db push refused (probably a destructive change). Inspect schema diff before re-running." }
  Pass "schema in sync"
} finally { Pop-Location }

# ----- 6. Build -----
Step "6" "Next.js build"
Push-Location "$Repo\saas"
try {
  & npm run build 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  if ($LASTEXITCODE -ne 0) {
    Warn "next build failed; bringing mse-saas back up so site isn't dark"
    Start-AppService $SVC_SAAS
    Abort "next build failed (exit $LASTEXITCODE)"
  }
  Pass "build ok"
} finally { Pop-Location }

# ----- 7. Start services -----
Step "7" "Start mse-saas + mse-wa"
Start-AppService $SVC_SAAS
Start-Sleep -Seconds 2
Start-AppService $SVC_WA
Info "waiting 12s for services to stabilize..."
Start-Sleep -Seconds 12

# ----- 8. Health check -----
Step "8" "Health check"
if (Test-Path "$Here\health-check.ps1") {
  & "$Here\health-check.ps1" -InstallDir $InstallDir
  if ($LASTEXITCODE -ne 0) { Abort "health-check.ps1 reported failures" }
} else {
  Warn "health-check.ps1 not found; skipping"
}

# ----- Done -----
$dt = [int]((Get-Date) - $T0).TotalSeconds
$newHead = $null; try { $newHead = & git -C $Repo rev-parse HEAD 2>$null } catch {}
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  DEPLOY SUCCEEDED in ${dt}s" -ForegroundColor Green
if ($newHead) { Write-Host "  HEAD: $newHead" -ForegroundColor Green }
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next: smoke test https://app.keyone1.com/login and /admin/metrics" -ForegroundColor Cyan
