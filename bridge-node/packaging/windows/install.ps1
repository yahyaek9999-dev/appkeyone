# KEYONE WhatsApp Bridge — Windows installer.
# Ships inside keyone-wa-bridge-win-x64.zip alongside node.exe + app\ + run.cmd.
# Installs to %ProgramFiles%\KEYONE WA Bridge, puts `keyone-bridge` on PATH,
# detects Chrome, and registers an at-logon Scheduled Task. Run in an elevated
# PowerShell:
#   Expand-Archive keyone-wa-bridge-win-x64.zip; cd keyone-wa-bridge-win-x64; .\install.ps1
$ErrorActionPreference = "Stop"
$Dest = Join-Path $env:ProgramFiles "KEYONE WA Bridge"
$Src  = $PSScriptRoot
# NOTE: do NOT use $Home — it is a PowerShell automatic variable (the user profile).
$HomeDir = Join-Path $env:LOCALAPPDATA "keyone-wa-bridge"

Write-Host "Installing KEYONE WA Bridge to $Dest ..."
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
New-Item -ItemType Directory -Force -Path $HomeDir | Out-Null
Copy-Item -Recurse -Force (Join-Path $Src "app")      $Dest
Copy-Item -Force          (Join-Path $Src "node.exe") $Dest

# The Bridge downloads its OWN matched Chromium (the build WhatsApp Web pairing
# needs) into %LOCALAPPDATA%\keyone-wa-bridge\chromium on first run — we do NOT
# point it at a system Chrome, which is a mismatched build that breaks pairing.

# CLI shims (BOTH documented names). They set the SAME home the service uses, so
# `keyone-bridge login` links the exact session the Scheduled Task runs.
$shim = @"
@echo off
if "%KEYONE_BRIDGE_HOME%"=="" set "KEYONE_BRIDGE_HOME=$HomeDir"
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

# at-logon Scheduled Task (persistence across reboots) — same home as the CLI.
# Bound to the INSTALLING interactive user so the task's %LOCALAPPDATA% == the
# CLI's home (so `keyone-bridge login` and the service share one config.json).
$run = Join-Path $Dest "keyone-bridge.cmd"
$action  = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$run`" start"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$set     = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
try {
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName "KEYONE WA Bridge" -Action $action -Trigger $trigger -Settings $set -Principal $principal -Force | Out-Null
  Write-Host "Auto-start task registered (runs at every logon)."
} catch {
  Write-Warning "Could not register auto-start task: $_  (the bridge will still run this session)"
}

# START THE DAEMON NOW — mac uses `launchctl bootstrap`, Linux uses `systemctl
# start`; Windows previously did NEITHER, so nothing ran until the next logon and
# the bridge stayed offline. -AtLogOn will NOT fire in this already-logged-in
# session, so we both arm the task and launch the daemon directly. The running
# daemon idle-waits and picks up the token the moment `keyone-bridge login` writes
# config.json (within ~5s) — no re-logon needed.
try { Start-ScheduledTask -TaskName "KEYONE WA Bridge" -ErrorAction SilentlyContinue } catch {}
try {
  Start-Process -FilePath (Join-Path $Dest "keyone-bridge.cmd") -ArgumentList "start" -WindowStyle Hidden -ErrorAction Stop
  Write-Host "Bridge daemon started."
} catch {
  Write-Warning "Could not auto-start the daemon: $_"
}

Write-Host ""
Write-Host "Installed and running. Open a NEW terminal (so PATH refreshes), then:"
Write-Host "  keyone-bridge login          # link this machine (shows a short code)"
Write-Host "  Approve the code in your KEYONE Dashboard; the bridge connects automatically"
Write-Host "  (within a few seconds), then click 'Start / Show QR' and scan it."
Write-Host "  If it is not online within ~30s, run:  keyone-bridge start"
