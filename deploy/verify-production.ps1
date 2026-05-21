#Requires -Version 7.0
<#
.SYNOPSIS
    KEYONE production verification script.

.DESCRIPTION
    Runs locally from a development machine and checks the Windows VPS over SSH.
    It does not modify production state.
#>
[CmdletBinding()]
param(
    [string]$VPSHost = "217.154.163.16",
    [string]$VPSUser = "Administrator",
    [string]$SSHKey = "$HOME/.ssh/id_ed25519",
    [string]$AppDir = "C:\app",
    [string]$Service = "mse-saas"
)

$ErrorActionPreference = "Stop"
$Checks = New-Object System.Collections.Generic.List[object]

function Add-Check {
    param([string]$Name, [bool]$Pass, [string]$Detail)
    $Checks.Add([pscustomobject]@{ Name = $Name; Pass = $Pass; Detail = $Detail }) | Out-Null
    $color = if ($Pass) { "Green" } else { "Red" }
    $label = if ($Pass) { "PASS" } else { "FAIL" }
    Write-Host "[$label] $Name - $Detail" -ForegroundColor $color
}

function Invoke-VPS {
    param([Parameter(Mandatory)][string]$Command)
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))
    $target = "${VPSUser}@${VPSHost}"
    $remote = "powershell -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encoded"
    $out = @(& ssh -i $SSHKey -o StrictHostKeyChecking=no -o ConnectTimeout=20 $target $remote 2>&1)
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($out -join "`n"); Lines = $out }
}

Write-Host "KEYONE production verification" -ForegroundColor Cyan
Write-Host "VPS: $VPSUser@$VPSHost" -ForegroundColor Cyan
Write-Host "App: $AppDir" -ForegroundColor Cyan
Write-Host ""

# 1. SaaS service status
$r = Invoke-VPS "nssm status $Service 2>&1"
Add-Check "SaaS service status" ($r.Output -match "SERVICE_RUNNING|running|START") ($r.Output.Trim())

# 2. HTTP health
$r = Invoke-VPS @"
try {
  `$res = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 20
  Write-Host "HTTP `$(`$res.StatusCode) `$(`$res.Content)"
  exit 0
} catch {
  Write-Host `$_.Exception.Message
  exit 1
}
"@
Add-Check "Health endpoint" ($r.ExitCode -eq 0 -and $r.Output -match "HTTP 200") ($r.Output.Trim())

# 3. VPS commit versus origin/main
$r = Invoke-VPS @"
Set-Location '$AppDir'
git fetch origin 2>&1 | Out-Null
`$head = git rev-parse HEAD
`$origin = git rev-parse origin/main
Write-Host "HEAD=`$head ORIGIN_MAIN=`$origin"
if (`$head -eq `$origin) { exit 0 } else { exit 1 }
"@
Add-Check "VPS commit matches origin/main" ($r.ExitCode -eq 0) ($r.Output.Trim())

# 4. Disk space
$r = Invoke-VPS @"
`$d = Get-PSDrive C
`$freeGB = [math]::Round(`$d.Free / 1GB, 2)
Write-Host "C: free=`$freeGB GB"
if (`$freeGB -gt 2) { exit 0 } else { exit 1 }
"@
Add-Check "Disk space" ($r.ExitCode -eq 0) ($r.Output.Trim())

# 5. .env exists
$r = Invoke-VPS "if (Test-Path '$AppDir\saas\.env') { Write-Host 'saas/.env exists'; exit 0 } else { Write-Host 'saas/.env missing'; exit 1 }"
Add-Check "SaaS .env exists" ($r.ExitCode -eq 0) ($r.Output.Trim())

# 6. Prisma DB exists
$r = Invoke-VPS @"
`$paths = @('$AppDir\saas\prisma\prod.db', '$AppDir\saas\prisma\dev.db', '$AppDir\saas\dev.db')
`$found = `$paths | Where-Object { Test-Path `$_ } | Select-Object -First 1
if (`$found) { Write-Host "DB found: `$found"; exit 0 } else { Write-Host 'No SQLite DB found'; exit 1 }
"@
Add-Check "Prisma SQLite DB exists" ($r.ExitCode -eq 0) ($r.Output.Trim())

# 7. WhatsApp service status
$r = Invoke-VPS "nssm status mse-wa 2>&1"
Add-Check "WhatsApp service status" ($r.Output -match "SERVICE_RUNNING|running|START") ($r.Output.Trim())

# 8. Git working tree clean enough for safe pull
$r = Invoke-VPS @"
Set-Location '$AppDir'
`$status = git status --porcelain
if (`$status) { `$status; exit 1 } else { Write-Host 'clean'; exit 0 }
"@
Add-Check "VPS git working tree clean" ($r.ExitCode -eq 0) ($r.Output.Trim())

Write-Host ""
$failed = @($Checks | Where-Object { -not $_.Pass })
if ($failed.Count -eq 0) {
    Write-Host "PRODUCTION VERIFY: PASS" -ForegroundColor Green
    exit 0
}

Write-Host "PRODUCTION VERIFY: FAIL ($($failed.Count) checks failed)" -ForegroundColor Red
$failed | ForEach-Object { Write-Host " - $($_.Name): $($_.Detail)" -ForegroundColor Red }
exit 1
