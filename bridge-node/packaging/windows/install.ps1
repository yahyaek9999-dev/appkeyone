# KEYONE WhatsApp Bridge — Windows installer.
# Ships inside keyone-wa-bridge-win-x64.zip alongside node.exe + app\ + run.cmd.
# Installs to %ProgramFiles%\KEYONE WA Bridge, puts `keyone-bridge` on PATH,
# detects Chrome, and registers an at-logon Scheduled Task. Run in an elevated
# PowerShell:
#   Expand-Archive keyone-wa-bridge-win-x64.zip; cd keyone-wa-bridge-win-x64; .\install.ps1
$ErrorActionPreference = "Stop"
$Dest = Join-Path $env:ProgramFiles "KEYONE WA Bridge"
$Src  = $PSScriptRoot
$Home = Join-Path $env:LOCALAPPDATA "keyone-wa-bridge"

Write-Host "Installing KEYONE WA Bridge to $Dest ..."
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
New-Item -ItemType Directory -Force -Path $Home | Out-Null
Copy-Item -Recurse -Force (Join-Path $Src "app")      $Dest
Copy-Item -Force          (Join-Path $Src "node.exe") $Dest

# The Bridge downloads its OWN matched Chromium (the build WhatsApp Web pairing
# needs) into %LOCALAPPDATA%\keyone-wa-bridge\chromium on first run — we do NOT
# point it at a system Chrome, which is a mismatched build that breaks pairing.

# CLI shims (BOTH documented names). They set the SAME home the service uses, so
# `keyone-bridge login` links the exact session the Scheduled Task runs.
$shim = @"
@echo off
if "%KEYONE_BRIDGE_HOME%"=="" set "KEYONE_BRIDGE_HOME=$Home"
"%~dp0node.exe" "%~dp0app\keyone-wa-bridge.js" %*
"@
Set-Content -Encoding ASCII -Path (Join-Path $Dest "keyone-bridge.cmd")    -Value $shim
Set-Content -Encoding ASCII -Path (Join-Path $Dest "keyone-wa-bridge.cmd") -Value $shim

# Put the install dir on the USER PATH (idempotent) — no manual PATH edit needed.
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (($userPath -split ';') -notcontains $Dest) {
  [Environment]::SetEnvironmentVariable("Path", ($userPath.TrimEnd(';') + ";" + $Dest), "User")
  Write-Host "Added to PATH: $Dest"
}

# at-logon Scheduled Task (auto-start) — same home as the CLI.
$run = Join-Path $Dest "keyone-bridge.cmd"
$action  = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$run`" start"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$set     = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "KEYONE WA Bridge" -Action $action -Trigger $trigger -Settings $set -RunLevel Limited -Force | Out-Null

Write-Host ""
Write-Host "Installed. Open a NEW terminal (so PATH refreshes), then:"
Write-Host "  keyone-bridge login          # link this machine (shows a short code)"
Write-Host "  (the bridge then auto-starts at logon; scan the QR from your KEYONE Dashboard)"
