# ============================================================
#  KEYONE - Pre-deploy full backup
# ------------------------------------------------------------
#  Creates a timestamped snapshot of everything that must
#  survive a deploy:
#    1. SQLite DB                (path read from saas\.env)
#    2. WhatsApp auth/sessions   (path read from whatsapp-service\.env, fallback)
#    3. All three .env files
#    4. Prisma schema + migrations
#
#  Output:  $InstallDir\backups\pre-deploy-<timestamp>\
#  Exits non-zero on any failure so the deploy orchestrator can abort.
#
#  Run from elevated PowerShell:
#      .\backup-all.ps1
#      .\backup-all.ps1 -InstallDir "C:\app"
# ============================================================

[CmdletBinding()]
param(
    [string]$InstallDir = "C:\app"
)

$ErrorActionPreference = "Stop"

$Repo      = $InstallDir
$BackupRoot = Join-Path $InstallDir "backups"
$Stamp     = Get-Date -Format "yyyy-MM-dd_HHmmss"
$Snap      = Join-Path $BackupRoot "pre-deploy-$Stamp"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  KEYONE pre-deploy backup" -ForegroundColor Cyan
Write-Host "  Snapshot: $Snap" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path $Snap | Out-Null

# ---------- helper: read KEY=VALUE from a .env file ----------
function Get-EnvValue {
    param([string]$EnvFile, [string]$Key)
    if (-not (Test-Path $EnvFile)) { return $null }
    $line = Get-Content $EnvFile | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
    if (-not $line) { return $null }
    $val = ($line -replace "^\s*$Key\s*=\s*", "").Trim()
    # strip surrounding quotes
    $val = $val -replace '^"(.*)"$', '$1'
    $val = $val -replace "^'(.*)'$", '$1'
    return $val
}

# ---------- 1. SQLite DB ----------
# Prisma resolves relative DATABASE_URL paths relative to the schema.prisma
# location (saas\prisma), not the project root. Try every plausible location.
$saasEnv  = Join-Path $Repo "saas\.env"
$dbUrl    = Get-EnvValue $saasEnv "DATABASE_URL"
$dbPath   = $null
if ($dbUrl -match "^file:(.+)$") {
    $rel = $matches[1]
    if ([System.IO.Path]::IsPathRooted($rel)) {
        $dbPath = $rel
    } else {
        $candidates = @(
            (Join-Path "$Repo\saas\prisma" $rel),  # Prisma's actual base dir
            (Join-Path "$Repo\saas"        $rel),
            (Join-Path "$Repo"             $rel)
        )
        foreach ($c in $candidates) {
            $clean = [System.IO.Path]::GetFullPath($c)
            if (Test-Path $clean) { $dbPath = $clean; break }
        }
    }
}

if ($dbPath -and (Test-Path $dbPath)) {
    Write-Host "[+] Backing up SQLite DB: $dbPath" -ForegroundColor Yellow
    $dbDest = Join-Path $Snap "saas.db"
    $sqliteExe = (Get-Command sqlite3 -ErrorAction SilentlyContinue).Source
    if ($sqliteExe) {
        # consistent online snapshot
        & $sqliteExe $dbPath ".backup '$dbDest'"
        if ($LASTEXITCODE -ne 0) { throw "sqlite3 .backup failed (exit $LASTEXITCODE)" }
    } else {
        Copy-Item -Path $dbPath -Destination $dbDest -Force
        # also try -wal and -shm if present
        foreach ($suffix in @("-wal","-shm")) {
            $extra = "$dbPath$suffix"
            if (Test-Path $extra) {
                Copy-Item -Path $extra -Destination "$dbDest$suffix" -Force
            }
        }
    }
    $sizeKb = [int]((Get-Item $dbDest).Length / 1024)
    Write-Host "    -> $dbDest ($sizeKb KB)" -ForegroundColor Green
} else {
    Write-Warning "DATABASE_URL not found or DB missing. Looked at: $dbPath"
}

# ---------- 2. WhatsApp auth / sessions ----------
$waEnv     = Join-Path $Repo "whatsapp-service\.env"
$waSessions = Get-EnvValue $waEnv "SESSIONS_DIR"
if (-not $waSessions) { $waSessions = Join-Path $Repo "whatsapp-service\sessions" }
if (-not [System.IO.Path]::IsPathRooted($waSessions)) {
    $waSessions = Join-Path "$Repo\whatsapp-service" $waSessions
}

if (Test-Path $waSessions) {
    Write-Host "[+] Backing up WhatsApp sessions: $waSessions" -ForegroundColor Yellow
    $waDest = Join-Path $Snap "wa-sessions"
    # Robocopy is the only reliable Windows option for deep-locked Chromium files
    & robocopy $waSessions $waDest /E /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    # Robocopy uses non-zero "success" exit codes (0-7); only 8+ is a real failure
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed for sessions dir (exit $LASTEXITCODE)" }
    Write-Host "    -> $waDest" -ForegroundColor Green
} else {
    Write-Warning "WhatsApp sessions dir not found at: $waSessions (skipping; first deploy?)"
}

# ---------- 3. .env files ----------
Write-Host "[+] Backing up .env files" -ForegroundColor Yellow
$envDest = Join-Path $Snap "env"
New-Item -ItemType Directory -Force -Path $envDest | Out-Null
foreach ($pair in @(
    @{ src = "$Repo\saas\.env";              name = "saas.env" }
    @{ src = "$Repo\whatsapp-service\.env";  name = "whatsapp-service.env" }
    @{ src = "$Repo\.env";                   name = "root.env" }
)) {
    if (Test-Path $pair.src) {
        Copy-Item -Path $pair.src -Destination (Join-Path $envDest $pair.name) -Force
        Write-Host "    -> $($pair.name)" -ForegroundColor Green
    } else {
        Write-Host "    (skip) $($pair.src) not found" -ForegroundColor DarkGray
    }
}

# ---------- 4. Prisma schema + migrations ----------
$prismaSrc = Join-Path $Repo "saas\prisma"
if (Test-Path $prismaSrc) {
    Write-Host "[+] Backing up prisma/ (schema + migrations)" -ForegroundColor Yellow
    $prismaDest = Join-Path $Snap "prisma"
    Copy-Item -Path $prismaSrc -Destination $prismaDest -Recurse -Force
    Write-Host "    -> $prismaDest" -ForegroundColor Green
}

# ---------- 5. Manifest ----------
# Capture git HEAD only if this dir is actually a git repo, otherwise
# record "not-a-git-repo" without raising an error.
$gitHead = $null; $gitBranch = $null
try {
    $gitHead   = (& git -C $Repo rev-parse HEAD 2>&1)
    $gitBranch = (& git -C $Repo rev-parse --abbrev-ref HEAD 2>&1)
    if ($LASTEXITCODE -ne 0) { $gitHead = "not-a-git-repo"; $gitBranch = "not-a-git-repo" }
} catch {
    $gitHead = "not-a-git-repo"; $gitBranch = "not-a-git-repo"
}
$manifest = [pscustomobject]@{
    timestamp   = $Stamp
    installDir  = $InstallDir
    dbSource    = $dbPath
    waSessions  = $waSessions
    gitHead     = $gitHead
    gitBranch   = $gitBranch
}
$manifest | ConvertTo-Json | Set-Content -Path (Join-Path $Snap "manifest.json") -Encoding UTF8

# ---------- 6. Maintain a "latest" pointer ----------
$latestPtr = Join-Path $BackupRoot "latest.txt"
Set-Content -Path $latestPtr -Value $Snap -Encoding UTF8

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Backup complete." -ForegroundColor Green
Write-Host "  Snapshot: $Snap" -ForegroundColor Green
Write-Host "  Pointer:  $latestPtr" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
exit 0
