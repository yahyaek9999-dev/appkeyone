# Installs the Abandoned-Cart recovery cron as a Windows Scheduled Task.
# Runs C:\app\run-abandoned-cart.ps1 every 60 minutes. Idempotent.
# IMPORTANT: This task does NOTHING until a merchant enables bot.abandonedCartEnabled.

$ErrorActionPreference = 'Continue'

$taskName  = 'KEYONE-Abandoned-Cart'
$runner    = 'C:\app\run-abandoned-cart.ps1'

if (-not (Test-Path $runner)) {
    Write-Host "ERROR: $runner not found." -ForegroundColor Red
    exit 1
}

cmd /c "schtasks /Query /TN $taskName >nul 2>&1"
if ($LASTEXITCODE -eq 0) {
    cmd /c "schtasks /Delete /TN $taskName /F >nul 2>&1"
    Write-Host "Removed existing task: $taskName"
}

$action = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$runner`""

schtasks /Create `
    /TN $taskName `
    /TR $action `
    /SC MINUTE `
    /MO 60 `
    /RU SYSTEM `
    /RL HIGHEST `
    /F | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Installed scheduled task '$taskName' (every 60 minutes)." -ForegroundColor Green
} else {
    Write-Host "Failed to install scheduled task." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "NOTE: Enable for a merchant via bot.abandonedCartEnabled = true in Bot settings." -ForegroundColor Cyan
