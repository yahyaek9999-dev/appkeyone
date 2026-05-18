# Install Scheduled Task to drain broadcast queue every minute.
$ErrorActionPreference = 'Continue'

$taskName = 'KEYONE-Broadcasts'
$runner   = 'C:\app\run-broadcasts.ps1'

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
    /MO 1 `
    /RU SYSTEM `
    /RL HIGHEST `
    /F | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Installed scheduled task '$taskName' (every 1 minute)." -ForegroundColor Green
} else {
    Write-Host "Failed to install task." -ForegroundColor Red; exit 1
}

New-Item -ItemType Directory -Force -Path C:\app\logs | Out-Null

Write-Host ""
Write-Host "Smoke test:" -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runner

Get-Content C:\app\logs\broadcasts.log -Tail 3 -ErrorAction SilentlyContinue
