#Requires -Version 7.0
<#
.SYNOPSIS
    Installs the `keydeploy` PowerShell command for the current user.

.DESCRIPTION
    Adds a small function to the current user's PowerShell profile. The function
    calls this repository's deploy/keydeploy.ps1 script, so production deployment
    becomes a single command:

        keydeploy

    Use -DryRun to test without changing production:

        keydeploy -DryRun
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$KeyDeployScript = Join-Path $RepoRoot "deploy/keydeploy.ps1"
$ProfilePath = $PROFILE.CurrentUserAllHosts
$ProfileDir = Split-Path $ProfilePath -Parent

if (-not (Test-Path $ProfileDir)) {
    New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null
}
if (-not (Test-Path $ProfilePath)) {
    New-Item -ItemType File -Force -Path $ProfilePath | Out-Null
}

$blockStart = "# >>> KEYONE keydeploy >>>"
$blockEnd = "# <<< KEYONE keydeploy <<<"
$functionBlock = @"
$blockStart
function keydeploy {
    param([switch]`$DryRun)
    `$script = '$KeyDeployScript'
    if (`$DryRun) {
        pwsh -NoProfile -ExecutionPolicy Bypass -File `$script -DryRun
    } else {
        pwsh -NoProfile -ExecutionPolicy Bypass -File `$script
    }
}
$blockEnd
"@

$current = Get-Content $ProfilePath -Raw -ErrorAction SilentlyContinue
if ($current -match [regex]::Escape($blockStart)) {
    $pattern = "(?s)" + [regex]::Escape($blockStart) + ".*?" + [regex]::Escape($blockEnd)
    $updated = [regex]::Replace($current, $pattern, $functionBlock.Trim())
} else {
    $updated = ($current.TrimEnd() + "`n`n" + $functionBlock.Trim() + "`n")
}

Set-Content -Path $ProfilePath -Value $updated -Encoding UTF8

Write-Host "Installed keydeploy into PowerShell profile:" -ForegroundColor Green
Write-Host "  $ProfilePath" -ForegroundColor White
Write-Host ""
Write-Host "Restart PowerShell, or run this now:" -ForegroundColor Yellow
Write-Host "  . `$PROFILE" -ForegroundColor White
Write-Host ""
Write-Host "Then deploy with:" -ForegroundColor Yellow
Write-Host "  keydeploy" -ForegroundColor White
Write-Host "Dry-run:" -ForegroundColor Yellow
Write-Host "  keydeploy -DryRun" -ForegroundColor White
