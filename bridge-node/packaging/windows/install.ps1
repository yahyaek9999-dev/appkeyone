# KEYONE WhatsApp Bridge — Windows installer.
# Ships inside keyone-wa-bridge-win-x64.zip alongside node.exe + app\ + run.cmd.
# Installs to %ProgramFiles%\KEYONE WA Bridge, detects Chrome, and registers an
# at-logon Scheduled Task so the bridge auto-starts. Run in an elevated PowerShell:
#   Expand-Archive keyone-wa-bridge-win-x64.zip; cd keyone-wa-bridge-win-x64; .\install.ps1
$ErrorActionPreference = "Stop"
$Dest = Join-Path $env:ProgramFiles "KEYONE WA Bridge"
$Src  = $PSScriptRoot

Write-Host "Installing KEYONE WA Bridge to $Dest ..."
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Copy-Item -Recurse -Force (Join-Path $Src "app")     $Dest
Copy-Item -Force          (Join-Path $Src "node.exe") $Dest
Copy-Item -Force          (Join-Path $Src "run.cmd")  $Dest

# Detect Chrome / Edge (whatsapp-web.js needs a real Chromium engine).
$chrome = $null
foreach ($p in @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe")) {
  if (Test-Path $p) { $chrome = $p; break }
}
$home = Join-Path $env:LOCALAPPDATA "keyone-wa-bridge"
New-Item -ItemType Directory -Force -Path $home | Out-Null
"$chrome" | Out-File -Encoding ascii (Join-Path $Dest "chrome.txt")
if ($chrome) { Write-Host "Detected browser: $chrome" }
else { Write-Warning "No Chrome/Edge found — install Google Chrome, then re-run, or the bridge will download Chromium on first run." }

# at-logon Scheduled Task (auto-start). Env passed via the run.cmd wrapper.
$run = Join-Path $Dest "run.cmd"
$action  = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c set KEYONE_CHROME=$chrome&& set KEYONE_BRIDGE_HOME=$home&& `"$run`" start"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$set     = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "KEYONE WA Bridge" -Action $action -Trigger $trigger -Settings $set -RunLevel Limited -Force | Out-Null

Write-Host ""
Write-Host "Installed. Next steps:"
Write-Host "  1) Link:  `"$Dest\run.cmd`" login"
Write-Host "  2) Start now (or just log out/in):  Start-ScheduledTask -TaskName 'KEYONE WA Bridge'"
Write-Host "  3) Scan the QR from your KEYONE Dashboard."
