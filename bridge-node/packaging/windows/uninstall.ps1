# KEYONE WhatsApp Bridge — Windows uninstaller.
$ErrorActionPreference = "SilentlyContinue"
$Dest = Join-Path $env:ProgramFiles "KEYONE WA Bridge"
Unregister-ScheduledTask -TaskName "KEYONE WA Bridge" -Confirm:$false
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
# Remove the install dir from the USER PATH.
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath) {
  $new = ($userPath -split ';' | Where-Object { $_ -and $_ -ne $Dest }) -join ';'
  [Environment]::SetEnvironmentVariable("Path", $new, "User")
}
Remove-Item -Recurse -Force $Dest
Write-Host "KEYONE WA Bridge removed (PATH cleaned). Your link/session in %LOCALAPPDATA%\keyone-wa-bridge was kept — delete it to fully unlink."
