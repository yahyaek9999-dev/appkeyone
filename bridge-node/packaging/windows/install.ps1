# KEYONE WhatsApp Bridge — Windows installer (run via install.cmd).
# Ships inside keyone-wa-bridge-win-x64.zip alongside node.exe + app\ + run.cmd.
#
# PER-USER install (no administrator rights, mirroring the macOS per-user
# LaunchAgent): %LOCALAPPDATA%\Programs\KEYONE WA Bridge. The previous installer
# wrote to %ProgramFiles% and silently died for every non-elevated customer —
# the reported "terminal opens and immediately closes".
#
# Steps: stop any running copy → copy payload → CLI shims on the user PATH →
# per-user at-logon Scheduled Task (hidden window) → start the daemon now.
$ErrorActionPreference = "Stop"
$Src  = $PSScriptRoot
$Dest = Join-Path $env:LOCALAPPDATA "Programs\KEYONE WA Bridge"
$OldDest = Join-Path $env:ProgramFiles "KEYONE WA Bridge"   # pre-1.0.4 admin install
# NOTE: do NOT use $Home — it is a PowerShell automatic variable (the user profile).
$HomeDir = Join-Path $env:LOCALAPPDATA "keyone-wa-bridge"
$TaskName = "KEYONE WA Bridge"

function Stop-BridgeProcesses {
  param([string[]]$Roots)
  # End the scheduled task first, then kill ONLY node.exe processes that run
  # from a bridge install dir — never every node.exe on the machine.
  try { schtasks /End /TN $TaskName 2>$null | Out-Null } catch {}
  foreach ($p in (Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue)) {
    foreach ($root in $Roots) {
      if ($p.ExecutablePath -and $p.ExecutablePath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        try { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
      }
    }
  }
  Start-Sleep -Milliseconds 800
}

try {
  Write-Host "Installing KEYONE WA Bridge to $Dest ..."

  # Downloaded-from-internet files carry the Mark-of-the-Web; unblock our payload.
  try { Get-ChildItem -Recurse -Path $Src | Unblock-File -ErrorAction SilentlyContinue } catch {}

  # A running daemon locks node.exe — reinstalls/upgrades must stop it first.
  Stop-BridgeProcesses -Roots @($Dest, $OldDest)

  New-Item -ItemType Directory -Force -Path $Dest    | Out-Null
  New-Item -ItemType Directory -Force -Path $HomeDir | Out-Null
  Copy-Item -Recurse -Force (Join-Path $Src "app")      $Dest
  Copy-Item -Force          (Join-Path $Src "node.exe") $Dest
  Copy-Item -Force          (Join-Path $Src "uninstall.ps1")  $Dest -ErrorAction SilentlyContinue
  Copy-Item -Force          (Join-Path $Src "uninstall.cmd")  $Dest -ErrorAction SilentlyContinue

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

  # Hidden-window launcher for the Scheduled Task — an Interactive task running
  # cmd.exe pops a persistent console at every logon otherwise.
  $vbs = 'CreateObject("Wscript.Shell").Run """" & WScript.Arguments(0) & """ start", 0, False'
  Set-Content -Encoding ASCII -Path (Join-Path $Dest "start-hidden.vbs") -Value $vbs

  # USER PATH: add the new dir, drop the old ProgramFiles entry (idempotent).
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $parts = @()
  if ($userPath) { $parts = $userPath -split ';' | Where-Object { $_ -and $_ -ne $OldDest } }
  if ($parts -notcontains $Dest) { $parts += $Dest }
  [Environment]::SetEnvironmentVariable("Path", ($parts -join ';'), "User")
  Write-Host "CLI on PATH: keyone-bridge (open a NEW terminal to pick it up)"

  # Pre-1.0.4 admin install: retire it so exactly ONE daemon exists. Removal
  # needs the rights it was created with; if we can't delete it, disable it.
  if (Test-Path $OldDest) {
    try {
      Remove-Item -Recurse -Force $OldDest -ErrorAction Stop
      Write-Host "Removed old installation at $OldDest"
    } catch {
      Write-Warning "An older installation exists at `"$OldDest`" and could not be removed without administrator rights. It is no longer on PATH or scheduled; you can delete the folder manually."
    }
  }

  # Per-user at-logon Scheduled Task (persistence across reboots) — same home as
  # the CLI. Registering a task for YOURSELF needs no elevation.
  $wscript = Join-Path $env:WINDIR "System32\wscript.exe"
  $runCmd  = Join-Path $Dest "keyone-bridge.cmd"
  $action  = New-ScheduledTaskAction -Execute $wscript -Argument "`"$(Join-Path $Dest 'start-hidden.vbs')`" `"$runCmd`""
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $set     = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
  try {
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $set -Principal $principal -Force | Out-Null
    Write-Host "Auto-start registered (runs hidden at every logon)."
  } catch {
    Write-Warning "Could not register auto-start task: $_  (the bridge will still run this session)"
  }

  # START THE DAEMON NOW — -AtLogOn will not fire in this already-logged-in
  # session. The daemon idle-waits and picks up the token the moment
  # `keyone-bridge login` writes config.json — no re-logon needed. The runtime's
  # single-instance lock guarantees only ONE of these ever drives WhatsApp.
  $started = $false
  try { Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop; $started = $true } catch {}
  if (-not $started) {
    try {
      Start-Process -FilePath $runCmd -ArgumentList "start" -WindowStyle Hidden -ErrorAction Stop
      $started = $true
    } catch {
      Write-Warning "Could not auto-start the daemon: $_"
    }
  }
  if ($started) { Write-Host "Bridge daemon started (background)." }

  Write-Host ""
  Write-Host "Installed. Next steps:"
  Write-Host "  1. Open a NEW terminal (PowerShell or CMD) so PATH refreshes."
  Write-Host "  2. Run:  keyone-bridge login    (shows a short code)"
  Write-Host "  3. Approve the code in your KEYONE Dashboard - the bridge connects"
  Write-Host "     automatically, then click 'Start / Show QR' and scan with WhatsApp."
  Write-Host "  Diagnostics:  keyone-bridge doctor     Logs:  keyone-bridge logs"
  exit 0
} catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host ($_.ScriptStackTrace) -ForegroundColor DarkGray
  exit 1
}
