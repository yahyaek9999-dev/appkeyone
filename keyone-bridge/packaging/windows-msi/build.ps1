<#
.SYNOPSIS  Build the KEYONE Bridge MSI from keyone-bridge.wxs (WiX v3).
.USAGE     .\build.ps1 -BinPath ..\..\dist\keyone-bridge_windows_amd64.exe -Version 0.4.0
.NOTES     Requires the WiX Toolset (candle.exe + light.exe on PATH).
           Sign the result before distribution:
             signtool sign /fd sha256 /a keyone-bridge-<ver>.msi
#>
param(
  [Parameter(Mandatory=$true)][string]$BinPath,
  [Parameter(Mandatory=$true)][string]$Version
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command candle.exe -ErrorAction SilentlyContinue)) {
  throw "WiX Toolset not found (candle.exe). Install from https://wixtoolset.org/."
}
if (-not (Test-Path $BinPath)) { throw "Binary not found: $BinPath" }

$wxs = Join-Path $here "keyone-bridge.wxs"
$obj = Join-Path $here "keyone-bridge.wixobj"
$msi = "keyone-bridge-$Version.msi"

& candle.exe -dVersion="$Version" -dBinPath="$BinPath" -out $obj $wxs
& light.exe -ext WixUtilExtension -out $msi $obj
Remove-Item $obj -ErrorAction SilentlyContinue
Write-Host "Built $msi (UNSIGNED — signtool before distribution)."
