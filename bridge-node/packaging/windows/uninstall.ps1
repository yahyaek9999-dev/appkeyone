# KEYONE WhatsApp Bridge — Windows uninstaller (run via uninstall.cmd).
$ErrorActionPreference = "SilentlyContinue"
$Dest    = Join-Path $env:LOCALAPPDATA "Programs\KEYONE WA Bridge"
$OldDest = Join-Path $env:ProgramFiles "KEYONE WA Bridge"   # pre-1.0.4 admin install
$TaskName = "KEYONE WA Bridge"

try { schtasks /End /TN $TaskName 2>$null | Out-Null } catch {}
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Kill ONLY node.exe processes running from a bridge install dir — never every
# node.exe on the machine (the previous uninstaller did, killing unrelated apps).
foreach ($p in (Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue)) {
  foreach ($root in @($Dest, $OldDest)) {
    if ($p.ExecutablePath -and $p.ExecutablePath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
      Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
}
Start-Sleep -Milliseconds 800

# Remove BOTH install locations from the USER PATH.
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath) {
  $new = ($userPath -split ';' | Where-Object { $_ -and $_ -ne $Dest -and $_ -ne $OldDest }) -join ';'
  [Environment]::SetEnvironmentVariable("Path", $new, "User")
}

Remove-Item -Recurse -Force $Dest    -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $OldDest -ErrorAction SilentlyContinue

Write-Host "KEYONE WA Bridge removed (PATH cleaned)."
Write-Host "Your link/session in %LOCALAPPDATA%\keyone-wa-bridge was kept - delete that folder to fully unlink."
