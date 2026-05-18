# Installs the daily DB backup as a Windows Scheduled Task.
# Run once on the VPS. Subsequent runs are idempotent.

$ErrorActionPreference = 'Continue'

$taskName  = 'KEYONE-DB-Backup'
$script    = 'C:\app\backup-db.ps1'
$workingDir = 'C:\app'

if (-not (Test-Path $script)) {
    Write-Host "ERROR: $script not found. Copy backup-db.ps1 to C:\app first." -ForegroundColor Red
    exit 1
}

# Remove any pre-existing task with the same name (silently ignore "task not found")
cmd /c "schtasks /Query /TN $taskName >nul 2>&1"
if ($LASTEXITCODE -eq 0) {
    cmd /c "schtasks /Delete /TN $taskName /F >nul 2>&1"
    Write-Host "Removed existing task: $taskName"
}

# Create a daily task at 03:30 server time, running as SYSTEM
$action = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$script`""
schtasks /Create `
    /TN $taskName `
    /TR $action `
    /SC DAILY `
    /ST 03:30 `
    /RU SYSTEM `
    /RL HIGHEST `
    /F | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Installed scheduled task '$taskName' — daily at 03:30." -ForegroundColor Green
} else {
    Write-Host "Failed to install scheduled task." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Running once now as a smoke test..." -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Backup OK. Files in C:\app\backups:" -ForegroundColor Green
    Get-ChildItem C:\app\backups -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object Name, Length, LastWriteTime -First 5 |
        Format-Table -AutoSize
} else {
    Write-Host "Smoke test FAILED — check log at C:\app\backups\backup.log" -ForegroundColor Red
    exit 1
}
