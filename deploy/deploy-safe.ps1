#Requires -Version 7.0
<#
.SYNOPSIS
    KEYONE — Safe Remote Deploy  (runs locally on your Mac, deploys to VPS via SSH)

.DESCRIPTION
    Performs a full safety-checked deployment to the production Windows VPS:

      1.  Verify local git branch is 'main'
      2.  Warn on uncommitted local changes
      3.  Push latest commits to GitHub  (git push origin main)
      4.  SSH → create timestamped backup snapshot  (db + .env)
      5.  SSH → git fetch origin
      6.  SSH → git pull --ff-only origin main  (safe, non-destructive)
      7.  SSH → verify saas/.env exists  (abort if missing)
      8.  SSH → nssm stop mse-saas
      9.  SSH → npm run build  (10-minute hard timeout, live output)
     10.  SSH → nssm start mse-saas
     11.  Wait 10 seconds for the service to initialise
     12.  SSH → health check  /api/health  (up to 3 retries)
     13.  Report DEPLOY SUCCEEDED or DEPLOY FAILED with remediation hints

    All remote commands are base64-encoded with PowerShell -EncodedCommand so
    there are zero shell-quoting issues regardless of paths or special characters.

.PARAMETER DryRun
    Print every action that would be taken without connecting to the VPS
    or making any changes. Git push is also skipped.

.EXAMPLE
    # Standard deploy
    pwsh ./deploy/deploy-safe.ps1

.EXAMPLE
    # Preview all steps without touching the VPS
    pwsh ./deploy/deploy-safe.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

# ══════════════════════════════════════════════════════════════════════════════
#  CONFIGURATION  — update these if your VPS or service names ever change
# ══════════════════════════════════════════════════════════════════════════════
$VPS_HOST = "217.154.163.16"
$VPS_USER = "Administrator"
$SSH_KEY  = "$HOME/.ssh/id_ed25519"
$APP_DIR  = "C:\app"
$SERVICE  = "mse-saas"

# Derived — mirrors the VPS directory layout documented in INFRASTRUCTURE.md
$SAAS_DIR    = "$APP_DIR\saas"
$BACKUP_ROOT = "$APP_DIR\backups"

# ══════════════════════════════════════════════════════════════════════════════
#  CONSOLE HELPERS
# ══════════════════════════════════════════════════════════════════════════════
function Write-Header {
    param([string]$Text, [string]$Color = 'Cyan')
    $bar = '═' * 62
    Write-Host ""
    Write-Host $bar -ForegroundColor $Color
    Write-Host "  $Text" -ForegroundColor $Color
    Write-Host $bar -ForegroundColor $Color
}

function Write-Step {
    param([string]$N, [string]$Msg)
    Write-Host ""
    Write-Host "  ┌─ STEP $N ─────────────────────────────────────────" -ForegroundColor Cyan
    Write-Host "  │  $Msg" -ForegroundColor Cyan
    Write-Host "  └───────────────────────────────────────────────────" -ForegroundColor Cyan
}

function Write-Pass   { param([string]$Msg) Write-Host "  [PASS] $Msg" -ForegroundColor Green }
function Write-Warn   { param([string]$Msg) Write-Host "  [WARN] $Msg" -ForegroundColor Yellow }
function Write-Info   { param([string]$Msg) Write-Host "  [....] $Msg" -ForegroundColor DarkGray }
function Write-DryRun { param([string]$Msg) Write-Host "  [DRYRUN] $Msg" -ForegroundColor DarkYellow }

function Remove-TransportNoise {
    param([object[]]$Lines)
    return @($Lines | Where-Object {
        $line = [string]$_
        $line -notmatch '^\*\* WARNING: connection is not using' -and
        $line -notmatch '^\*\* This session may be vulnerable' -and
        $line -notmatch '^\*\* The server may need to be upgraded'
    })
}

# ══════════════════════════════════════════════════════════════════════════════
#  SSH HELPERS
# ══════════════════════════════════════════════════════════════════════════════

<#
.SYNOPSIS
    Execute a PowerShell command on the remote VPS via SSH.

    The command is base64-encoded with UTF-16 LE (the encoding PowerShell's
    -EncodedCommand expects), so no shell-quoting issues can arise regardless
    of backslashes, double-quotes, or special characters in the script block.

.OUTPUTS
    PSCustomObject { Success [bool], ExitCode [int], Output [string], Lines [string[]] }
#>
function Invoke-VPS {
    [OutputType([PSCustomObject])]
    param(
        [Parameter(Mandatory)][string]$Command,
        # Short description printed in -DryRun mode; defaults to first line of $Command
        [string]$Description   = (($Command -split "`n")[0].Trim()),
        # When set, a non-zero SSH exit code is not treated as a failure
        [switch]$IgnoreExitCode,
        # Suppress the remote output echo to the local terminal
        [switch]$HideOutput
    )

    if ($DryRun) {
        Write-DryRun "SSH → $Description"
        return [PSCustomObject]@{ Success = $true; ExitCode = 0; Output = ''; Lines = @() }
    }

    # Encode the PowerShell block to eliminate all quoting edge-cases
    $encoded   = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))
    $target    = "${VPS_USER}@${VPS_HOST}"
    $remoteCmd = "powershell -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encoded"

    $sshArgs = @(
        '-i',  $SSH_KEY,
        '-o',  'StrictHostKeyChecking=no',
        '-o',  'ConnectTimeout=30',
        '-o',  'ServerAliveInterval=30',
        '-o',  'ServerAliveCountMax=10',
        $target,
        $remoteCmd
    )

    # Capture both stdout and stderr; @() ensures we always get an array
    $rawLines = @(& ssh @sshArgs 2>&1)
    $exitCode = $LASTEXITCODE
    $lines    = Remove-TransportNoise -Lines $rawLines

    if (-not $HideOutput -and $lines) {
        $lines | ForEach-Object { Write-Info "$_" }
    }

    return [PSCustomObject]@{
        Success  = ($exitCode -eq 0) -or [bool]$IgnoreExitCode
        ExitCode = $exitCode
        Output   = ($lines -join "`n")
        Lines    = $lines
    }
}

<#
.SYNOPSIS
    Execute a long-running PowerShell command on the VPS with a hard timeout.
    Output streams live to the terminal (no capture buffering) — ideal for
    the npm build step where you want to see progress in real time.

.NOTES
    Uses System.Diagnostics.Process with WaitForExit(ms) for the timeout.
    Because stdout/stderr are NOT redirected, output flows directly to the
    caller's terminal as each line arrives from the SSH connection.
#>
function Invoke-VPSWithTimeout {
    param(
        [Parameter(Mandatory)][string]$Command,
        [string]$Description  = (($Command -split "`n")[0].Trim()),
        [int]$TimeoutSeconds  = 600
    )

    if ($DryRun) {
        Write-DryRun "SSH (timeout: ${TimeoutSeconds}s) → $Description"
        return
    }

    $encoded   = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))
    $target    = "${VPS_USER}@${VPS_HOST}"
    $remoteCmd = "powershell -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encoded"

    # Build ProcessStartInfo manually so ArgumentList.Add() handles quoting safely
    $psi = [System.Diagnostics.ProcessStartInfo]::new('ssh')
    $psi.UseShellExecute = $false   # inherit parent stdin/stdout/stderr → live streaming

    foreach ($arg in @(
        '-i',  $SSH_KEY,
        '-o',  'StrictHostKeyChecking=no',
        '-o',  'ConnectTimeout=30',
        '-o',  'ServerAliveInterval=30',
        '-o',  'ServerAliveCountMax=20',
        $target,
        $remoteCmd
    )) { $psi.ArgumentList.Add($arg) }

    $proc = [System.Diagnostics.Process]::new()
    $proc.StartInfo = $psi
    $proc.Start() | Out-Null

    $timedOut = -not $proc.WaitForExit($TimeoutSeconds * 1000)
    if ($timedOut) {
        try { $proc.Kill() } catch { }
        throw "$Description timed out after ${TimeoutSeconds}s"
    }

    if ($proc.ExitCode -ne 0) {
        throw "$Description failed (ssh/powershell exit code $($proc.ExitCode))"
    }
}

# ══════════════════════════════════════════════════════════════════════════════
#  BANNER
# ══════════════════════════════════════════════════════════════════════════════
$startTime = Get-Date

Write-Header "KEYONE — Safe Remote Deploy to Production"
Write-Host "  VPS Host  : $VPS_HOST" -ForegroundColor White
Write-Host "  VPS User  : $VPS_USER" -ForegroundColor White
Write-Host "  App Dir   : $APP_DIR" -ForegroundColor White
Write-Host "  Service   : $SERVICE" -ForegroundColor White
Write-Host "  SSH Key   : $SSH_KEY" -ForegroundColor White
Write-Host "  Started   : $($startTime.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor White

if ($DryRun) {
    Write-Host ""
    Write-Host "  *** DRY-RUN MODE — no VPS changes will be made ***" -ForegroundColor DarkYellow
}

# ══════════════════════════════════════════════════════════════════════════════
#  DEPLOY PIPELINE
# ══════════════════════════════════════════════════════════════════════════════
try {

    # ── STEP 1 ── Verify local branch is 'main' ───────────────────────────────
    Write-Step '1/12' "Verify local git branch is 'main'"

    $branch = (git branch --show-current 2>&1).Trim()
    if ($branch -ne 'main') {
        throw "You are on branch '$branch'. Switch to main before deploying:`n  git checkout main"
    }
    Write-Pass "Local branch: main"

    # ── STEP 2 ── Check for uncommitted changes ────────────────────────────────
    Write-Step '2/12' "Check for uncommitted local changes"

    $dirty = @(git status --porcelain 2>&1)
    if ($dirty.Count -gt 0) {
        Write-Warn "Uncommitted changes detected:"
        $dirty | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }
        Write-Warn "The VPS will receive origin/main — your unstaged changes will NOT be deployed."
        Write-Warn "Commit and push them first if you meant to include them in this deploy."
    } else {
        Write-Pass "Working tree is clean"
    }

    # ── STEP 3 ── Push to GitHub ──────────────────────────────────────────────
    Write-Step '3/12' "Push latest commits to GitHub  (git push origin main)"

    if ($DryRun) {
        Write-DryRun "Would run: git push origin main"
    } else {
        Write-Info "Running: git push origin main"
        $pushOut = @(git push origin main 2>&1)
        if ($LASTEXITCODE -ne 0) {
            throw "git push failed (exit $LASTEXITCODE).`n  Output: $($pushOut -join ' | ')"
        }
        $pushOut | ForEach-Object { Write-Info $_ }
        Write-Pass "GitHub is up-to-date with local main"
    }

    # ── SSH key pre-flight (skip in dry-run) ──────────────────────────────────
    if (-not $DryRun -and -not (Test-Path $SSH_KEY)) {
        throw "SSH key not found: $SSH_KEY`nGenerate one with:`n  ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519"
    }

    # ── STEP 4 ── Create pre-deploy backup on VPS ─────────────────────────────
    Write-Step '4/12' "Create pre-deploy backup on VPS  (db + .env)"

    # In the @"..."@ here-string below:
    #   $BACKUP_ROOT, $SAAS_DIR, $APP_DIR  →  local variables, expanded here
    #   `$ts, `$snap, `$dbPath, etc.       →  remote PS variables, escaped
    $backupCmd = @"
`$ts   = Get-Date -Format 'yyyyMMdd-HHmmss'
`$snap = '$BACKUP_ROOT\safe-deploy-' + `$ts
New-Item -ItemType Directory -Force -Path `$snap | Out-Null

# ── backup saas/.env ──────────────────────────────────────────────────────
`$envFile = '$SAAS_DIR\.env'
if (Test-Path `$envFile) {
    Copy-Item -Path `$envFile -Destination "`$snap\saas.env" -Force
    Write-Host "  .env  saved"
} else {
    Write-Host "  [WARN] .env not found at `$envFile"
}

# ── backup SQLite database (path resolved from DATABASE_URL in .env) ───────
`$dbPath = `$null
`$dbLine = `$null
`$dbRaw = Get-Content `$envFile -ErrorAction SilentlyContinue |
    Where-Object { `$_ -match '^\s*DATABASE_URL\s*=' } |
    Select-Object -First 1
if (`$dbRaw) {
    `$dbLine = (`$dbRaw -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
    # Only SQLite file URLs can be backed up here. Other providers are skipped safely.
    if (`$dbLine -match '^file:(.+)$') {
        `$dbLine = `$matches[1]
        # Remove optional query params/fragments and normalize common sqlite relative prefixes.
        `$dbLine = (`$dbLine -split '[?#]', 2)[0].Trim()
        if (`$dbLine) {
            if ([System.IO.Path]::IsPathRooted(`$dbLine)) {
                `$dbPath = `$dbLine
            } else {
                `$dbPath = [System.IO.Path]::GetFullPath((Join-Path '$SAAS_DIR\prisma' `$dbLine))
            }
        }
    } else {
        Write-Host "  [WARN] DATABASE_URL is not a sqlite file: URL; DB backup skipped"
    }
}
if (`$dbPath -and (Test-Path `$dbPath)) {
    `$sq = Get-Command sqlite3 -ErrorAction SilentlyContinue
    if (`$sq) {
        & sqlite3 `$dbPath ".backup '`$snap\prod.db'"
        Write-Host "  db    saved (sqlite3 online backup)"
    } else {
        Copy-Item -Path `$dbPath -Destination "`$snap\prod.db" -Force
        Write-Host "  db    saved (file copy — sqlite3 not found)"
    }
} else {
    Write-Host "  [WARN] DB not found at '`$dbPath' — backup skipped"
}

# ── write manifest ────────────────────────────────────────────────────────
"SAFE-DEPLOY-BACKUP `$ts" | Set-Content -Path "`$snap\MANIFEST.txt" -Encoding UTF8
Write-Host "  Snapshot: `$snap"
exit 0
"@

    $r4 = Invoke-VPS -Command $backupCmd -Description "Pre-deploy backup (db + .env)" -IgnoreExitCode
    if (-not $DryRun -and $r4.ExitCode -ne 0) {
        Write-Warn "Backup step had issues — proceeding (backup failure is advisory, not blocking)."
    } else {
        Write-Pass "Backup snapshot created"
    }

    # ── STEP 5 ── git fetch origin ────────────────────────────────────────────
    Write-Step '5/12' "SSH: git fetch origin"

    $r5 = Invoke-VPS -Command @"
git -C '$APP_DIR' fetch origin 2>&1
exit `$LASTEXITCODE
"@ -Description "git fetch origin"

    if (-not $r5.Success) {
        throw "git fetch failed on VPS (exit $($r5.ExitCode)). Check internet/GitHub access."
    }
    Write-Pass "git fetch OK"

    # ── STEP 6 ── safe fast-forward pull ─────────────────────────────────────
    Write-Step '6/12' "SSH: git pull --ff-only origin main"

    $r6 = Invoke-VPS -Command @"
Set-Location '$APP_DIR'
`$branch = (git branch --show-current 2>&1).Trim()
if (`$branch -ne 'main') {
    Write-Host "Current branch is '`$branch'. Switching to main..."
    git switch main 2>&1
    if (`$LASTEXITCODE -ne 0) {
        Write-Host "Unable to switch to main safely. Fix VPS working tree first."
        exit `$LASTEXITCODE
    }
}
git pull --ff-only origin main 2>&1
exit `$LASTEXITCODE
"@ -Description "git pull --ff-only origin main"

    if (-not $r6.Success) {
        throw "Safe git pull failed on VPS (exit $($r6.ExitCode)). The VPS may have local changes or a divergent branch. Do NOT reset blindly; inspect with git status and git log before deploying."
    }
    Write-Pass "VPS code fast-forwarded to origin/main"

    # ── STEP 7 ── Verify .env exists ──────────────────────────────────────────
    Write-Step '7/12' "SSH: verify saas/.env exists"

    $r7 = Invoke-VPS -Command @"
if (Test-Path '$SAAS_DIR\.env') {
    `$lineCount = (Get-Content '$SAAS_DIR\.env' -ErrorAction SilentlyContinue).Count
    Write-Host "ENV_OK lines=`$lineCount"
    exit 0
} else {
    Write-Host "ENV_MISSING path=$SAAS_DIR\.env"
    exit 1
}
"@ -Description "Verify .env exists" -HideOutput

    if (-not $r7.Success) {
        $envPath = "$SAAS_DIR\.env"
        throw ".env is MISSING on the VPS at '$envPath'.`n  The service cannot start without it.`n  SSH to VPS and create it:`n    ssh -i $SSH_KEY ${VPS_USER}@${VPS_HOST}`n  Then deploy again."
    }
    $envInfoLine = $r7.Lines | Where-Object { $_ -match '^ENV_OK' } | Select-Object -First 1
    $envInfo = if ($envInfoLine) { ($envInfoLine -replace 'ENV_OK ', '').Trim() } else { 'dry-run or no details' }
    Write-Pass ".env file is present ($envInfo)"

    # ── STEP 8 ── Stop the service ────────────────────────────────────────────
    Write-Step '8/12' "SSH: nssm stop $SERVICE"

    # IgnoreExitCode because NSSM returns 0 even when service was already stopped
    Invoke-VPS -Command @"
nssm stop $SERVICE 2>&1
Start-Sleep -Seconds 3
exit 0
"@ -Description "nssm stop $SERVICE" -IgnoreExitCode | Out-Null

    Write-Pass "$SERVICE stopped (or was already stopped)"

    # ── STEP 9 ── npm run build (10-minute timeout, live output) ──────────────
    Write-Step '9/12' "SSH: npm run build  [max 10 minutes, output streams live]"
    Write-Host ""
    Write-Info "Build output will appear below in real time..."
    Write-Host "  ────────────────────────────────────────────────────────────" -ForegroundColor DarkGray

    Invoke-VPSWithTimeout -Command @"
`$ErrorActionPreference = 'Stop'
Set-Location '$SAAS_DIR'
Write-Host "  Dir     : `$(Get-Location)"
Write-Host "  Started : `$(Get-Date -Format 'HH:mm:ss')"
npm run build 2>&1
`$code = `$LASTEXITCODE
Write-Host "  Finished: `$(Get-Date -Format 'HH:mm:ss')  exit=`$code"
exit `$code
"@ -Description "npm run build" -TimeoutSeconds 600

    Write-Host "  ────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Pass "Build completed successfully"

    # ── Post-build cache cleanup ──────────────────────────────────────────────
    Invoke-VPS -Command @"
`$cache = '$SAAS_DIR\.next\cache'
if (Test-Path `$cache) {
    Remove-Item -LiteralPath `$cache -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Removed build cache: `$cache"
} else {
    Write-Host "No Next build cache to remove"
}
exit 0
"@ -Description "Remove .next/cache after successful build" -IgnoreExitCode | Out-Null
    Write-Pass "Post-build cache cleanup completed"

    # ── STEP 10 ── Start the service ──────────────────────────────────────────
    Write-Step '10/12' "SSH: nssm start $SERVICE"

    $r10 = Invoke-VPS -Command @"
nssm start $SERVICE 2>&1
exit `$LASTEXITCODE
"@ -Description "nssm start $SERVICE"

    if (-not $r10.Success) {
        throw "nssm start $SERVICE failed (exit $($r10.ExitCode))."
    }
    Write-Pass "$SERVICE started"

    # ── STEP 11 ── Wait for the service to initialise ─────────────────────────
    Write-Step '11/12' "Wait 10 seconds for service to initialise"

    if ($DryRun) {
        Write-DryRun "Would wait 10 seconds"
    } else {
        Write-Host -NoNewline "  "
        1..10 | ForEach-Object {
            Write-Host -NoNewline "·" -ForegroundColor DarkGray
            Start-Sleep -Seconds 1
        }
        Write-Host ""
    }
    Write-Pass "Initialisation wait complete"

    # ── STEP 12 ── Health check ───────────────────────────────────────────────
    Write-Step '12/12' "SSH: health check  →  http://127.0.0.1:3000/api/health"

    $healthCmd = @"
`$maxRetries = 3
for (`$i = 1; `$i -le `$maxRetries; `$i++) {
    try {
        `$r    = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 15
        `$body = `$r.Content | ConvertFrom-Json
        if (`$body.status -eq 'ok') {
            Write-Host "HEALTH_OK status=`$(`$body.status) db=`$(`$body.db) uptime=`$(`$body.uptime)s latency=`$(`$body.latencyMs)ms"
            exit 0
        }
        Write-Host "HEALTH_WARN attempt `$i/`$maxRetries status=`$(`$body.status)"
    } catch {
        Write-Host "HEALTH_ERR attempt `$i/`$maxRetries : `$(`$_.Exception.Message)"
        if (`$i -lt `$maxRetries) { Start-Sleep -Seconds 5 }
    }
}
Write-Host "HEALTH_FAIL all `$maxRetries attempts exhausted"
exit 1
"@

    $r12 = Invoke-VPS -Command $healthCmd -Description "Health check" -HideOutput

    if (-not $r12.Success) {
        throw "Health check FAILED after 3 attempts.`n  The service may be crashing. Check logs on the VPS:`n    Get-Content C:\app\logs\mse-saas.err.log -Tail 50"
    }

    # Extract the HEALTH_OK line for inline display
    $healthLine = $r12.Lines | Where-Object { $_ -match 'HEALTH_OK' } | Select-Object -Last 1
    $healthDetail = if ($healthLine) { " — $($healthLine.Trim())" } else { '' }
    Write-Pass "Health check PASSED$healthDetail"

    # ══════════════════════════════════════════════════════════════════════════
    #  SUCCESS
    # ══════════════════════════════════════════════════════════════════════════
    $elapsed = [int]((Get-Date) - $startTime).TotalSeconds

    Write-Header "DEPLOY SUCCEEDED  (+${elapsed}s)" 'Green'
    Write-Host "  Service   : $SERVICE is live" -ForegroundColor Green
    Write-Host "  Dashboard : https://app.keyone1.com/dashboard" -ForegroundColor Green
    Write-Host "  Health    : https://app.keyone1.com/api/health" -ForegroundColor Green
    Write-Host "  Metrics   : https://app.keyone1.com/admin/metrics" -ForegroundColor Green
    if ($DryRun) {
        Write-Host ""
        Write-Host "  (Dry-run mode: nothing was actually deployed)" -ForegroundColor DarkYellow
    }
    Write-Host ""

} catch {

    # ══════════════════════════════════════════════════════════════════════════
    #  FAILURE — print the error and actionable next steps
    # ══════════════════════════════════════════════════════════════════════════
    $elapsed = [int]((Get-Date) - $startTime).TotalSeconds

    Write-Header "DEPLOY FAILED  (+${elapsed}s)" 'Red'
    Write-Host "  Error    : $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Location : $($_.InvocationInfo.ScriptName):$($_.InvocationInfo.ScriptLineNumber)" -ForegroundColor Red
    Write-Host ""
    Write-Host "  What to do next:" -ForegroundColor Yellow
    Write-Host "  1. SSH to VPS and read the service log:" -ForegroundColor White
    Write-Host "       ssh -i $SSH_KEY ${VPS_USER}@${VPS_HOST}" -ForegroundColor DarkGray
    Write-Host "       Get-Content C:\app\logs\mse-saas.err.log -Tail 50" -ForegroundColor DarkGray
    Write-Host "  2. If the service stopped, restart it manually:" -ForegroundColor White
    Write-Host "       nssm start $SERVICE" -ForegroundColor DarkGray
    Write-Host "  3. Roll back to the previous working commit:" -ForegroundColor White
    Write-Host "       pwsh ./deploy/rollback.ps1" -ForegroundColor DarkGray
    Write-Host "  4. Verify current production state:" -ForegroundColor White
    Write-Host "       pwsh ./deploy/verify-production.ps1" -ForegroundColor DarkGray
    Write-Host ""
    exit 1
}
