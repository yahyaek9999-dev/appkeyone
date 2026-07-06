<#
.SYNOPSIS
  Install KEYONE Bridge as a Windows Service (runs as LocalSystem with a
  machine-wide, file-encrypted secret store).
.USAGE
  Run in an elevated PowerShell:
    .\install.ps1 -Binary .\keyone-bridge_windows_amd64.exe
#>
param(
  [string]$Binary = ".\keyone-bridge_windows_amd64.exe"
)
$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run this in an elevated (Administrator) PowerShell."
}
if (-not (Test-Path $Binary)) { throw "Binary not found: $Binary" }

$InstallDir = Join-Path $env:ProgramFiles "KEYONE Bridge"
$DataDir    = Join-Path $env:ProgramData "KEYONE Bridge"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
Copy-Item $Binary (Join-Path $InstallDir "keyone-bridge.exe") -Force

# Machine-wide env so the service (LocalSystem) and an interactive `login` in an
# elevated shell share the same encrypted vault.
[Environment]::SetEnvironmentVariable("KEYONE_BRIDGE_HOME", $DataDir, "Machine")
[Environment]::SetEnvironmentVariable("KEYONE_BRIDGE_SECRET_FILE", "1", "Machine")
$env:KEYONE_BRIDGE_HOME = $DataDir
$env:KEYONE_BRIDGE_SECRET_FILE = "1"

$exe = '"{0}" start' -f (Join-Path $InstallDir "keyone-bridge.exe")
& sc.exe create KeyoneBridge binPath= $exe start= auto DisplayName= "KEYONE Bridge" | Out-Null
& sc.exe description KeyoneBridge "KEYONE Bridge transport connector" | Out-Null
# Auto-restart on crash (10s), reset the count daily.
& sc.exe failure KeyoneBridge reset= 86400 actions= restart/10000/restart/10000/restart/10000 | Out-Null

Write-Host "Installed to $InstallDir (data: $DataDir)."
Write-Host "Next (in this elevated shell so it uses the same vault):"
Write-Host "  & '$InstallDir\keyone-bridge.exe' login"
Write-Host "  Start-Service KeyoneBridge"
Write-Host "  Get-Service KeyoneBridge"
