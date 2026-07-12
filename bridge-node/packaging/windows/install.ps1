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

  # ---- Auto-link: generate a device code WITHOUT a terminal (No-Terminal UX) --
  # Mirrors the macOS postinstall flow (packaging/macos/build-pkg.sh). Only on a
  # FRESH install (no existing token) — upgrades keep their existing link and the
  # daemon reconnects on its own.
  $CfgFile = Join-Path $HomeDir "config.json"
  $alreadyLinked = $false
  if (Test-Path $CfgFile) {
    try {
      $cfg = Get-Content $CfgFile -Raw | ConvertFrom-Json
      if ($cfg.token -and $cfg.bridgeId) { $alreadyLinked = $true }
    } catch {}
  }
  if (-not $alreadyLinked) {
    $CloudApi = "https://w.keyone1.com"
    $TmpLog = Join-Path $env:TEMP "keyone-bridge-login-$([guid]::NewGuid().ToString('N')).log"
    try {
      Start-Process -FilePath $runCmd -ArgumentList "login" -WindowStyle Hidden `
        -RedirectStandardOutput $TmpLog -RedirectStandardError "$TmpLog.err" | Out-Null
    } catch {
      Write-Warning "Could not start the auto-link process: $_"
    }

    $code = $null
    for ($i = 0; $i -lt 12 -and -not $code; $i++) {
      Start-Sleep -Seconds 1
      if (Test-Path $TmpLog) {
        $m = Select-String -Path $TmpLog -Pattern '[A-Z0-9]{4}-[A-Z0-9]{4}' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($m) { $code = $m.Matches[0].Value }
      }
    }

    if ($code) {
      $linkUrl = "$CloudApi/dashboard/settings/bridge/link?user_code=$code"
      try { Start-Process $linkUrl } catch {}
      try {
        Add-Type -AssemblyName System.Windows.Forms | Out-Null
        [System.Windows.Forms.MessageBox]::Show(
          "رمز الربط: $code`n`nتم فتح لوحة التحكم في المتصفح - أدخل الرمز لربط هذا الجهاز.",
          "KEYONE WA Bridge - تثبيت مكتمل",
          [System.Windows.Forms.MessageBoxButtons]::OK,
          [System.Windows.Forms.MessageBoxIcon]::Information
        ) | Out-Null
      } catch {}
      Write-Host "Auto-link: code $code shown in a dialog. Browser opened to the link page."
    } else {
      try { Start-Process "$CloudApi/dashboard/settings/bridge" } catch {}
      Write-Host "Auto-link: could not capture a device code. Opened bridge settings to link manually."
    }
  }

  Write-Host ""
  Write-Host "Installed. Next steps:"
  Write-Host "  1. Approve the code shown in your KEYONE Dashboard."
  Write-Host "  2. The bridge connects automatically, then click 'Start / Show QR' and scan with WhatsApp."
  Write-Host "  (Optional terminal use: open a NEW terminal so PATH refreshes, then 'keyone-bridge doctor' or 'keyone-bridge logs'.)"
  exit 0
} catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host ($_.ScriptStackTrace) -ForegroundColor DarkGray
  exit 1
}
