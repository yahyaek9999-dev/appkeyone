# Installs the Smart Follow-up cron as a Windows Scheduled Task.
# Runs C:\app\run-followup.ps1 every 30 minutes. Idempotent.

$ErrorActionPreference = 'Continue'

$taskName  = 'KEYONE-Follow-Ups'
$runner    = 'C:\app\run-followup.ps1'

if (-not (Test-Path $runner)) {
    Write-Host "ERROR: $runner not found." -ForegroundColor Red
    exit 1
}

# Remove existing task silently if present
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

New-Item -ItemType Directory -Force -Path C:\app\logs | Out-Null

Write-Host ""
Write-Host "Smoke test (one-off):" -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runner

Write-Host ""
Write-Host "Last log line:" -ForegroundColor Cyan
Get-Content C:\app\logs\follow-ups.log -Tail 3 -ErrorAction SilentlyContinue
