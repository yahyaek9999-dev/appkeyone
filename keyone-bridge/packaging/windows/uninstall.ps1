<#
.SYNOPSIS  Remove the KEYONE Bridge Windows Service + files.
.USAGE     Elevated PowerShell:  .\uninstall.ps1 [-Purge]
#>
param([switch]$Purge)
$ErrorActionPreference = "SilentlyContinue"

& sc.exe stop KeyoneBridge | Out-Null
& sc.exe delete KeyoneBridge | Out-Null

$InstallDir = Join-Path $env:ProgramFiles "KEYONE Bridge"
Remove-Item -Recurse -Force $InstallDir

[Environment]::SetEnvironmentVariable("KEYONE_BRIDGE_HOME", $null, "Machine")
[Environment]::SetEnvironmentVariable("KEYONE_BRIDGE_SECRET_FILE", $null, "Machine")

if ($Purge) {
  Remove-Item -Recurse -Force (Join-Path $env:ProgramData "KEYONE Bridge")
  Write-Host "Uninstalled + purged data."
} else {
  Write-Host "Uninstalled. Data kept in $env:ProgramData\KEYONE Bridge (use -Purge to remove)."
}
