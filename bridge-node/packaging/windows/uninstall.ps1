# KEYONE WhatsApp Bridge — Windows uninstaller.
$ErrorActionPreference = "SilentlyContinue"
Unregister-ScheduledTask -TaskName "KEYONE WA Bridge" -Confirm:$false
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $env:ProgramFiles "KEYONE WA Bridge")
Write-Host "KEYONE WA Bridge removed. (Your link/session in %LOCALAPPDATA%\keyone-wa-bridge was kept — delete it to fully unlink.)"
