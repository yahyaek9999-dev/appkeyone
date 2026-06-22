# ============================================================
#  KEYONE WhatsApp Bot SaaS — Windows VPS Bootstrap
# ------------------------------------------------------------
#  Installs: Chocolatey, Node 20 LTS, Python 3.12, NSSM, Caddy,
#  Git, then clones the repo and prepares the runtime folders.
#
#  Run from elevated PowerShell:
#      Set-ExecutionPolicy Bypass -Scope Process -Force
#      .\setup-vps.ps1
# ============================================================

[CmdletBinding()]
param(
    [string]$RepoUrl    = "https://github.com/YOUR_GITHUB/mse_ai_api.git",
    [string]$InstallDir = "C:\KEYONE"
)

$ErrorActionPreference = "Stop"
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  KEYONE VPS bootstrap starting" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# 1) Chocolatey
if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "[+] Installing Chocolatey..." -ForegroundColor Yellow
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = 3072
    iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User")
}

# 2) Core packages
$pkgs = @("git", "nodejs-lts", "python", "nssm", "caddy", "vcredist140")
foreach ($p in $pkgs) {
    Write-Host "[+] Installing $p ..." -ForegroundColor Yellow
    choco install $p -y --no-progress --limit-output | Out-Null
}

# Refresh PATH for the current session
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path","User")

# 3) Folder structure
Write-Host "[+] Creating folders under $InstallDir" -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path "$InstallDir\logs" | Out-Null
New-Item -ItemType Directory -Force -Path "$InstallDir\data" | Out-Null
New-Item -ItemType Directory -Force -Path "C:\Caddy" | Out-Null

# 4) Clone or pull
if (-not (Test-Path "$InstallDir\repo\.git")) {
    Write-Host "[+] Cloning repository $RepoUrl" -ForegroundColor Yellow
    git clone $RepoUrl "$InstallDir\repo"
} else {
    Write-Host "[+] Pulling latest changes" -ForegroundColor Yellow
    Push-Location "$InstallDir\repo"
    git pull --ff-only
    Pop-Location
}

# 5) Python venv + deps for the CloakBrowser LLM API
Write-Host "[+] Setting up Python venv for LLM API..." -ForegroundColor Yellow
Push-Location "$InstallDir\repo"
if (-not (Test-Path ".venv")) {
    python -m venv .venv
}
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m playwright install chromium
Pop-Location

# 6) WhatsApp Node service
Write-Host "[+] Installing WhatsApp service deps..." -ForegroundColor Yellow
Push-Location "$InstallDir\repo\whatsapp-service"
npm ci --no-audit --no-fund
Pop-Location

# 7) Next.js SaaS app
Write-Host "[+] Installing SaaS deps + building..." -ForegroundColor Yellow
Push-Location "$InstallDir\repo\saas"
npm ci --no-audit --no-fund
npx prisma generate
npx prisma db push --accept-data-loss
npx tsx prisma/seed.ts
npm run build
Pop-Location

# 8) Caddy config
Write-Host "[+] Copying Caddyfile to C:\Caddy" -ForegroundColor Yellow
Copy-Item "$InstallDir\repo\deploy\Caddyfile" "C:\Caddy\Caddyfile" -Force

# 9) Open firewall ports 80 & 443
Write-Host "[+] Opening firewall ports 80 & 443" -ForegroundColor Yellow
New-NetFirewallRule -DisplayName "HTTP-80"  -Direction Inbound -Protocol TCP -LocalPort 80  -Action Allow -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule -DisplayName "HTTPS-443" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -ErrorAction SilentlyContinue | Out-Null

Write-Host "" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Bootstrap finished." -ForegroundColor Green
Write-Host "  Next: copy your .env files, then run:" -ForegroundColor Green
Write-Host "     .\start-services.ps1" -ForegroundColor Green
Write-Host "  Then register ALL cron jobs (REQUIRED — Meta webhooks," -ForegroundColor Green
Write-Host "  payments reconcile, QR scheduler, monthly credits, etc.):" -ForegroundColor Green
Write-Host "     Copy-Item .\run-cron.ps1 C:\app\run-cron.ps1 -Force" -ForegroundColor Green
Write-Host "     .\install-all-cron-tasks.ps1" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
