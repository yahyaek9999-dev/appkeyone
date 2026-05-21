#Requires -Version 7.0
<#
.SYNOPSIS
    KEYONE one-command production deploy wrapper.

.DESCRIPTION
    Runs the safe deploy pipeline and then the production verification suite.
    Intended to be invoked through the `keydeploy` PowerShell function installed
    by deploy/install-keydeploy.ps1.

.EXAMPLE
    pwsh ./deploy/keydeploy.ps1

.EXAMPLE
    pwsh ./deploy/keydeploy.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$DeploySafe = Join-Path $PSScriptRoot "deploy-safe.ps1"
$VerifyProduction = Join-Path $PSScriptRoot "verify-production.ps1"

function Write-Section {
    param([string]$Text, [string]$Color = "Cyan")
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor $Color
    Write-Host "  $Text" -ForegroundColor $Color
    Write-Host "============================================================" -ForegroundColor $Color
}

Write-Section "KEYONE keydeploy — one-command production deploy"
Write-Host "Repository : $Root" -ForegroundColor White
Write-Host "Dry-run    : $DryRun" -ForegroundColor White

try {
    Set-Location $Root

    Write-Section "1/2 Safe deploy"
    if ($DryRun) {
        & $DeploySafe -DryRun
    } else {
        & $DeploySafe
    }
    if ($LASTEXITCODE -ne 0) {
        throw "deploy-safe.ps1 failed with exit code $LASTEXITCODE"
    }

    Write-Section "2/2 Production verification"
    if ($DryRun) {
        Write-Host "Dry-run mode: skipping strict production verification because no deploy occurred." -ForegroundColor Yellow
        Write-Host "Run this anytime for a real read-only verification:" -ForegroundColor White
        Write-Host "  pwsh ./deploy/verify-production.ps1" -ForegroundColor White
    } else {
        & $VerifyProduction
        if ($LASTEXITCODE -ne 0) {
            throw "verify-production.ps1 failed with exit code $LASTEXITCODE"
        }
    }

    Write-Section "KEYDEPLOY PASS" "Green"
    Write-Host "Production deploy and verification completed successfully." -ForegroundColor Green
    exit 0
} catch {
    Write-Section "KEYDEPLOY FAIL" "Red"
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Recommended next actions:" -ForegroundColor Yellow
    Write-Host "  1. Run: pwsh ./deploy/verify-production.ps1" -ForegroundColor White
    Write-Host "  2. Check VPS service logs for mse-saas" -ForegroundColor White
    Write-Host "  3. If needed, roll back with deploy/rollback.ps1 on the VPS" -ForegroundColor White
    exit 1
}
