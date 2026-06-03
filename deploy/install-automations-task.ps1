# Installs the Automation Rules cron (idle_hours) as a Windows Scheduled Task.
# Event-driven triggers (score_crossed, order_status_changed, cart_abandoned)
# fire inline and do NOT need this task.

$ErrorActionPreference = 'Continue'

$taskName  = 'KEYONE-Automations'
$runner    = 'C:\app\run-automations.ps1'

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
    /MO 30 `
    /RU SYSTEM `
    /RL HIGHEST `
    /F | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Installed scheduled task '$taskName' (every 30 minutes)." -ForegroundColor Green
} else {
    Write-Host "Failed to install scheduled task." -ForegroundColor Red
    exit 1
}
