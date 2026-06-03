# ============================================================
#  KEYONE — Health-Gated Deploy Guard (Reliability Phase / Agent 3)
# ------------------------------------------------------------
#  Run AFTER a deploy has restarted mse-saas. Polls the deep readiness
#  probe (/api/ready) until the new build reports itself ready, and if it
#  never does within the budget, optionally triggers an automated rollback
#  to the last good snapshot.
#
#  This is the "verify before you trust" gate. /api/health (liveness) can be
#  200 while the app is still not safe to serve — /api/ready proves the DB is
#  reachable, the schema is migrated, and the outgoing queue isn't wedged.
#
#  Behaviour:
#    - Polls $BaseUrl/api/ready up to -Retries times, -DelaySec apart.
#    - "Ready" = HTTP 200 AND body.ready == true.
#    - A `degraded` verdict (warn-level checks) is treated as ready-enough by
#      default — pass -StrictDegraded to also fail the gate on degraded.
#    - On sustained failure: if -AutoRollback is set, invokes rollback.ps1
#      (last snapshot). Otherwise prints the exact rollback command and exits 1.
#
#  Exit 0 = healthy. Exit 1 = gate failed (rolled back or needs manual action).
#
#  Usage (on the VPS, after deploy):
#      .\health-gate.ps1
#      .\health-gate.ps1 -BaseUrl "http://127.0.0.1:3000" -Retries 6 -DelaySec 10
#      .\health-gate.ps1 -AutoRollback          # auto-rollback on failure
#      .\health-gate.ps1 -StrictDegraded        # treat 'degraded' as failure
# ============================================================

[CmdletBinding()]
param(
    [string]$BaseUrl        = "http://127.0.0.1:3000",
    [int]   $Retries        = 6,
    [int]   $DelaySec       = 10,
    [switch]$StrictDegraded,
    [switch]$AutoRollback,
    [string]$InstallDir     = "C:\app"
)

$ErrorActionPreference = "Stop"
$Here = $PSScriptRoot
$T0   = Get-Date

function Info($m) { Write-Host "  [..]   $m" -ForegroundColor DarkGray }
function Pass($m) { Write-Host "  [OK]   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Err($m)  { Write-Host "  [FAIL] $m" -ForegroundColor Red }

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  KEYONE Health Gate :: $BaseUrl/api/ready" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

$readyUrl = "$BaseUrl/api/ready"
$ok       = $false
$lastBody = $null

for ($i = 1; $i -le $Retries; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri $readyUrl -UseBasicParsing -TimeoutSec 8 -Headers @{ "Cache-Control" = "no-cache" }
        $lastBody = $resp.Content | ConvertFrom-Json
        $verdict  = $lastBody.verdict
        $isReady  = [bool]$lastBody.ready

        if ($isReady) {
            Pass "attempt ${i}/${Retries}: verdict=$verdict (ready)"
            $ok = $true
            break
        } elseif ($verdict -eq "degraded" -and -not $StrictDegraded) {
            Warn "attempt ${i}/${Retries}: verdict=degraded — serving but watch (pass -StrictDegraded to block)"
            $ok = $true
            break
        } else {
            $failChecks = ($lastBody.checks | Where-Object { $_.status -eq "fail" } | ForEach-Object { $_.name }) -join ", "
            Warn "attempt ${i}/${Retries}: verdict=$verdict failing=[$failChecks]"
        }
    } catch {
        Warn "attempt ${i}/${Retries}: /api/ready unreachable — $($_.Exception.Message)"
    }

    if ($i -lt $Retries) { Start-Sleep -Seconds $DelaySec }
}

$durSec = [int]((Get-Date) - $T0).TotalSeconds

if ($ok) {
    Write-Host ""
    Pass "Health gate PASSED in ${durSec}s — build is serving traffic."
    exit 0
}

# ---- Gate failed ------------------------------------------------------------
Write-Host ""
Err "Health gate FAILED after $Retries attempts (${durSec}s)."
if ($lastBody) {
    Info "Last readiness body:"
    ($lastBody | ConvertTo-Json -Depth 6) -split "`n" | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
}

$rollbackScript = Join-Path $Here "rollback.ps1"

if ($AutoRollback) {
    if (Test-Path $rollbackScript) {
        Warn "AutoRollback enabled — invoking rollback.ps1 (last snapshot)..."
        & $rollbackScript -InstallDir $InstallDir
        $rc = $LASTEXITCODE
        if ($rc -eq 0) {
            Warn "Rollback completed. Investigate the failed build before redeploying."
        } else {
            Err "Rollback script exited $rc — MANUAL INTERVENTION REQUIRED."
        }
    } else {
        Err "rollback.ps1 not found at $rollbackScript — cannot auto-rollback."
    }
} else {
    Err "Not rolling back automatically. To roll back now, run:"
    Write-Host "      $rollbackScript" -ForegroundColor Yellow
    Write-Host "    Or re-run this gate with -AutoRollback to do it automatically." -ForegroundColor Yellow
}

exit 1
