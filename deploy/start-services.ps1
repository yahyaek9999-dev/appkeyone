# ============================================================
#  KEYONE Services Registration with NSSM
# ------------------------------------------------------------
#  Registers 4 native Windows services:
#    1. KEYONE-LLM        (Python CloakBrowser API on :7788)
#    2. KEYONE-Whatsapp   (Node Puppeteer service  on :7799)
#    3. KEYONE-SaaS       (Next.js app             on :3000)
#    4. KEYONE-Caddy      (Reverse proxy + HTTPS  on :80/:443)
#
#  Run from elevated PowerShell:
#      .\start-services.ps1            # install / start
#      .\start-services.ps1 -Restart   # restart all
#      .\start-services.ps1 -Stop      # stop all
#      .\start-services.ps1 -Remove    # uninstall all
# ============================================================

[CmdletBinding()]
param(
    [string]$InstallDir = "C:\KEYONE",
    [switch]$Restart,
    [switch]$Stop,
    [switch]$Remove
)

$ErrorActionPreference = "Stop"

$Repo   = "$InstallDir\repo"
$Logs   = "$InstallDir\logs"
$Node   = (Get-Command node).Source
$Python = "$Repo\.venv\Scripts\python.exe"
$Caddy  = (Get-Command caddy).Source
$Npm    = (Get-Command npm).Source

if (-not (Test-Path $Logs)) { New-Item -ItemType Directory -Force -Path $Logs | Out-Null }

# ---------- Service definitions ----------
$services = @(
    @{
        Name        = "KEYONE-LLM"
        DisplayName = "KEYONE LLM API (CloakBrowser)"
        AppPath     = $Python
        Arguments   = "$Repo\main.py"
        WorkDir     = $Repo
        StdOut      = "$Logs\llm-stdout.log"
        StdErr      = "$Logs\llm-stderr.log"
    },
    @{
        Name        = "KEYONE-Whatsapp"
        DisplayName = "KEYONE WhatsApp Service"
        AppPath     = $Node
        Arguments   = "src/index.js"
        WorkDir     = "$Repo\whatsapp-service"
        StdOut      = "$Logs\whatsapp-stdout.log"
        StdErr      = "$Logs\whatsapp-stderr.log"
    },
    @{
        Name        = "KEYONE-SaaS"
        DisplayName = "KEYONE Next.js SaaS"
        AppPath     = $Npm
        Arguments   = "run start -- -p 3000"
        WorkDir     = "$Repo\saas"
        StdOut      = "$Logs\saas-stdout.log"
        StdErr      = "$Logs\saas-stderr.log"
    },
    @{
        Name        = "KEYONE-Caddy"
        DisplayName = "KEYONE Caddy Reverse Proxy"
        AppPath     = $Caddy
        Arguments   = "run --config C:\Caddy\Caddyfile --adapter caddyfile"
        WorkDir     = "C:\Caddy"
        StdOut      = "$Logs\caddy-stdout.log"
        StdErr      = "$Logs\caddy-stderr.log"
    }
)

function Test-Service($name) {
    return (Get-Service -Name $name -ErrorAction SilentlyContinue) -ne $null
}

function Remove-AllServices {
    foreach ($s in $services) {
        if (Test-Service $s.Name) {
            Write-Host "[-] Removing $($s.Name)" -ForegroundColor Yellow
            nssm stop    $s.Name confirm | Out-Null
            nssm remove  $s.Name confirm | Out-Null
        }
    }
}

function Stop-AllServices {
    foreach ($s in $services) {
        if (Test-Service $s.Name) {
            Write-Host "[~] Stopping $($s.Name)" -ForegroundColor Yellow
            nssm stop $s.Name | Out-Null
        }
    }
}

function Start-AllServices {
    foreach ($s in $services) {
        if (Test-Service $s.Name) {
            Write-Host "[>] Starting $($s.Name)" -ForegroundColor Green
            nssm start $s.Name | Out-Null
        }
    }
}

function Install-AllServices {
    foreach ($s in $services) {
        Write-Host "[+] Registering $($s.Name)" -ForegroundColor Cyan
        if (-not (Test-Service $s.Name)) {
            nssm install $s.Name $s.AppPath $s.Arguments | Out-Null
        }
        nssm set $s.Name AppDirectory          $s.WorkDir          | Out-Null
        nssm set $s.Name AppParameters         $s.Arguments        | Out-Null
        nssm set $s.Name DisplayName           $s.DisplayName      | Out-Null
        nssm set $s.Name Start                 SERVICE_AUTO_START  | Out-Null
        nssm set $s.Name AppStdout             $s.StdOut           | Out-Null
        nssm set $s.Name AppStderr             $s.StdErr           | Out-Null
        nssm set $s.Name AppRotateFiles        1                   | Out-Null
        nssm set $s.Name AppRotateBytes        10485760            | Out-Null
        nssm set $s.Name AppThrottle           5000                | Out-Null
        nssm set $s.Name AppExit Default       Restart             | Out-Null
        nssm set $s.Name AppRestartDelay       3000                | Out-Null
        Write-Host "[>] Starting $($s.Name)" -ForegroundColor Green
        nssm start $s.Name | Out-Null
    }
}

if ($Remove)  { Remove-AllServices; exit 0 }
if ($Stop)    { Stop-AllServices;   exit 0 }
if ($Restart) { Stop-AllServices; Start-AllServices; exit 0 }

Install-AllServices

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  All KEYONE services are running" -ForegroundColor Green
Write-Host "  Verify with:    Get-Service KEYONE-*" -ForegroundColor Green
Write-Host "  Tail logs from: $Logs" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
