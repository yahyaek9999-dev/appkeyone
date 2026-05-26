# ── KEYONE Deploy Script ──────────────────────────────────────────
# Safe, incremental deploy with full pre-deploy snapshot, cache clearing,
# build verification, non-destructive verification suite, and smoke testing.
#
# Run as Administrator from the VPS:
#   cd C:\app\deploy
#   .\deploy.ps1
#   .\deploy.ps1 -InstallDir "C:\app" -RestartWhatsApp
# ──────────────────────────────────────────────────────────────────

[CmdletBinding()]
param(
    [string]$InstallDir = "C:\app",
    [switch]$RestartWhatsApp
)

$ErrorActionPreference = 'Stop'
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$repo = $InstallDir
$deployDir = $PSScriptRoot
$saasDir = Join-Path $repo 'saas'
$backupScript = Join-Path $deployDir 'backup-all.ps1'
$rollbackScript = Join-Path $deployDir 'rollback.ps1'
$healthScript = Join-Path $deployDir 'health-check.ps1'

function Step($label)
{
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "  $label" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
}

function Run($description, $scriptBlock)
{
    Write-Host "  -> $description" -ForegroundColor Gray
    $oldEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try
    {
        & $scriptBlock
        $exit = $LASTEXITCODE
    } finally
    {
        $ErrorActionPreference = $oldEap
    }
    if ($exit -ne 0)
    { throw "$description failed (exit $exit)"
    }
}

Step '0/10 Rollback readiness checks'
if (!(Test-Path $backupScript))
{ throw "Missing backup script: $backupScript"
}
if (!(Test-Path $rollbackScript))
{ throw "Missing rollback script: $rollbackScript"
}
if (!(Test-Path $saasDir))
{ throw "Missing SaaS directory: $saasDir"
}
Write-Host "  Backup script : $backupScript" -ForegroundColor Green
Write-Host "  Rollback script: $rollbackScript" -ForegroundColor Green

Step '1/10 Pre-deploy full backup'
& $backupScript -InstallDir $InstallDir
if ($LASTEXITCODE -ne 0)
{ throw 'pre-deploy backup failed; deploy aborted'
}
$latestPtr = Join-Path $repo 'backups\latest.txt'
$snapshot = if (Test-Path $latestPtr)
{ (Get-Content $latestPtr -ErrorAction Stop).Trim()
} else
{ ''
}
if ($snapshot)
{ Write-Host "  Snapshot: $snapshot" -ForegroundColor Green
}

Step '2/10 Pull latest code'
Set-Location $repo
Run 'git fetch origin main' { git fetch origin main }
# The pre-deploy backup has already captured runtime state. Reset only the
# git working tree to the exact deployed commit so copied hotfix scripts or
# failed previous deploy attempts cannot block a safe production update.
Run 'git reset --hard origin/main' { git reset --hard origin/main }

Step '3/10 Install dependencies'
Set-Location $saasDir
# Include dev dependencies for TypeScript + Prisma validation/build, then prune
# after successful deploy if desired by the operator. This avoids npx fetching
# unexpected package versions during production deploy.
Run 'npm ci' { npm ci 2>&1 }

Step '4/10 Prisma validation and SQLite schema sync'
Run 'prisma validate' { npx prisma validate 2>&1 }
Run 'prisma db push --skip-generate' { npx prisma db push --skip-generate 2>&1 }
Run 'prisma generate' { npx prisma generate 2>&1 }

Step '5/10 TypeScript verification'
Run 'tsc --noEmit' { npx tsc -p tsconfig.json --noEmit 2>&1 }

Step '6/10 Clear stale Next cache and build'
if (Test-Path '.next\cache')
{
    Remove-Item '.next\cache' -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host '  Cleared .next/cache' -ForegroundColor Gray
}
Run 'npm run build' { npm run build 2>&1 }

Step '7/10 Production-safe verification suite'
Run 'npm run verify:all' { npm run verify:all 2>&1 }

Step '8/10 Restart services gracefully'
Write-Host '  Restarting mse-saas...' -ForegroundColor Gray
nssm restart mse-saas 2>&1
if ($LASTEXITCODE -ne 0)
{ throw 'mse-saas restart failed'
}

if ($RestartWhatsApp)
{
    Write-Host '  Restarting mse-wa because -RestartWhatsApp was supplied...' -ForegroundColor Yellow
    nssm restart mse-wa 2>&1
    if ($LASTEXITCODE -ne 0)
    { throw 'mse-wa restart failed'
    }
} else
{
    Write-Host '  Skipping mse-wa restart by default to preserve live WhatsApp sessions.' -ForegroundColor Yellow
    Write-Host '  Use -RestartWhatsApp only when deploying WhatsApp-service changes intentionally.' -ForegroundColor Yellow
}
Start-Sleep 15

Step '9/10 Health and runtime smoke checks'
$maxRetries = 3
$success = $false
for ($i = 1; $i -le $maxRetries; $i++)
{
    try
    {
        $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 15
        $body = $r.Content | ConvertFrom-Json
        if ($body.status -eq 'ok')
        {
            Write-Host "  Health OK (db=$($body.db), uptime=$($body.uptime)s, latency=$($body.latencyMs)ms)" -ForegroundColor Green
            $success = $true
            break
        }
        Write-Host "  Health returned status=$($body.status)" -ForegroundColor Yellow
    } catch
    {
        Write-Host "  Attempt $i/$maxRetries failed: $($_.Exception.Message)" -ForegroundColor Yellow
        if ($i -lt $maxRetries)
        { Start-Sleep 10
        }
    }
}
if (-not $success)
{ throw 'health smoke test failed'
}

if (Test-Path $healthScript)
{
    & $healthScript -InstallDir $InstallDir
    if ($LASTEXITCODE -ne 0)
    { throw 'post-deploy health-check.ps1 failed'
    }
}

Step '10/10 Deploy complete'
Write-Host "DEPLOY SUCCEEDED at $ts" -ForegroundColor Green
if ($snapshot)
{
    Write-Host "Rollback snapshot: $snapshot" -ForegroundColor Green
    Write-Host "Rollback command : $rollbackScript -InstallDir '$InstallDir' -Snapshot '$snapshot'" -ForegroundColor Yellow
}
