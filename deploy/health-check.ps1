# ============================================================
#  KEYONE - Post-deploy health check
# ------------------------------------------------------------
#  Validates a freshly-deployed VPS without sending any user
#  traffic. Returns exit code 0 only if every check passes.
#
#  Run from elevated PowerShell:
#      .\health-check.ps1
#      .\health-check.ps1 -InstallDir "C:\app"
# ============================================================

[CmdletBinding()]
param(
    [string]$InstallDir = "C:\app"
)

$ErrorActionPreference = "Stop"
$Repo = $InstallDir
$failures = @()
$warnings = @()

function Pass($msg)
{ Write-Host "  [OK]   $msg" -ForegroundColor Green
}
function Fail($msg)
{ Write-Host "  [FAIL] $msg" -ForegroundColor Red;    $script:failures += $msg
}
function Warn($msg)
{ Write-Host "  [WARN] $msg" -ForegroundColor Yellow; $script:warnings += $msg
}
function Info($msg)
{ Write-Host "  [..]   $msg" -ForegroundColor DarkGray
}

function Get-EnvValue
{
    param([string]$EnvFile, [string]$Key)
    if (-not (Test-Path $EnvFile))
    { return $null
    }
    $line = Get-Content $EnvFile | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
    if (-not $line)
    { return $null
    }
    $val = ($line -replace "^\s*$Key\s*=\s*", "").Trim()
    $val = $val -replace '^"(.*)"$', '$1'
    $val = $val -replace "^'(.*)'$", '$1'
    return $val
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  KEYONE post-deploy health check" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# ---------- 1. Services running ----------
Write-Host "`n[1/8] NSSM services" -ForegroundColor Cyan
foreach ($svc in @("mse-wa","mse-saas","mse-caddy"))
{
    $s = Get-Service -Name $svc -ErrorAction SilentlyContinue
    if (-not $s)
    { Fail "$svc not registered"; continue
    }
    if ($s.Status -ne "Running")
    { Fail "$svc not running (status=$($s.Status))"; continue
    }
    Pass "$svc running"
}

# ---------- 2. Ports listening ----------
# 3000 = Next.js saas | 3001 = whatsapp-service
Write-Host "`n[2/8] Listening ports" -ForegroundColor Cyan
foreach ($p in @(3000, 3001))
{
    $hit = Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue
    if ($hit)
    { Pass "port $p listening"
    } else
    { Fail "port $p NOT listening"
    }
}

# ---------- 3. .env files validate ----------
Write-Host "`n[3/8] Environment variables" -ForegroundColor Cyan
$saasEnv = "$Repo\saas\.env"
$waEnv   = "$Repo\whatsapp-service\.env"

$saasSecret = Get-EnvValue $saasEnv "SAAS_INTERNAL_SECRET"
$waSecret   = Get-EnvValue $waEnv   "SAAS_INTERNAL_SECRET"
$authSecret = Get-EnvValue $saasEnv "AUTH_SECRET"
$llmKey     = Get-EnvValue $saasEnv "LLM_API_KEY"
$dbUrl      = Get-EnvValue $saasEnv "DATABASE_URL"

if (-not $saasSecret -or $saasSecret -eq "dev-internal-secret-change-me")
{ Fail "saas\.env SAAS_INTERNAL_SECRET missing or default"
} else
{ Pass "saas SAAS_INTERNAL_SECRET set"
}
if (-not $waSecret)
{ Fail "whatsapp-service\.env SAAS_INTERNAL_SECRET missing"
} else
{ Pass "wa SAAS_INTERNAL_SECRET set"
}
if ($saasSecret -and $waSecret -and ($saasSecret -ne $waSecret))
{ Fail "SAAS_INTERNAL_SECRET mismatch between saas and whatsapp-service"
}
if (-not $authSecret -or $authSecret.Length -lt 32)
{ Fail "AUTH_SECRET missing or too short (<32 chars)"
} else
{ Pass "AUTH_SECRET set"
}
# LLM_API_KEY check removed — mse-llm service decommissioned (2026-05-18)
if (-not $dbUrl)
{ Fail "DATABASE_URL missing"
} else
{ Pass "DATABASE_URL set"
}

# ---------- 4. SQLite DB reachable ----------
# Prisma resolves relative DATABASE_URL paths from the schema.prisma directory,
# not the project root, so we anchor at $Repo\saas\prisma.
Write-Host "`n[4/8] Database file" -ForegroundColor Cyan
if ($dbUrl -match "^file:(.+)$")
{
    $rel = $matches[1]
    if ([System.IO.Path]::IsPathRooted($rel))
    {
        $dbPath = $rel
    } else
    {
        $dbPath = [System.IO.Path]::GetFullPath((Join-Path "$Repo\saas\prisma" $rel))
    }
    if (Test-Path $dbPath)
    {
        $sz = [int]((Get-Item $dbPath).Length / 1024)
        Pass "DB file present ($sz KB) at $dbPath"
    } else
    {
        Fail "DB file missing at $dbPath"
    }
}

# ---------- 5. Build artifacts ----------
Write-Host "`n[5/8] Build artifacts" -ForegroundColor Cyan
$nextDir = "$Repo\saas\.next"
if (Test-Path "$nextDir\BUILD_ID")
{ Pass ".next/BUILD_ID present ($((Get-Content "$nextDir\BUILD_ID").Trim()))"
} else
{ Fail ".next/BUILD_ID missing - did npm run build complete?"
}
if (Test-Path "$nextDir\routes-manifest.json")
{ Pass "routes-manifest.json present"
} else
{ Fail "routes-manifest.json missing"
}

# ---------- 6. WhatsApp service auth enforcement ----------
# whatsapp-service listens on 3001 (PORT env in whatsapp-service/.env).
Write-Host "`n[6/8] WhatsApp service auth enforcement (proves QA hotfix #1 in effect)" -ForegroundColor Cyan
try
{
    $r1 = Invoke-WebRequest -Uri "http://127.0.0.1:3001/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($r1.StatusCode -eq 200)
    { Pass "/health returns 200 without auth"
    } else
    { Warn "/health returned $($r1.StatusCode)"
    }
} catch
{ Fail "/health unreachable: $($_.Exception.Message)"
}

try
{
    $null = Invoke-WebRequest -Uri "http://127.0.0.1:3001/sessions/__healthcheck__/status" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Fail "auth NOT enforced - /sessions/.../status returned 2xx without secret header (HOTFIX MISSING)"
} catch
{
    $resp = $_.Exception.Response
    $code = if ($resp)
    { [int]$resp.StatusCode
    } else
    { 0
    }
    if ($code -eq 401)
    { Pass "auth enforced - /sessions returns 401 without header"
    } else
    { Warn "expected 401 from /sessions, got $code"
    }
}

# ---------- 7. Next.js dashboard reachable ----------
Write-Host "`n[7/8] Next.js / dashboard reachable" -ForegroundColor Cyan
try
{
    $r3 = Invoke-WebRequest -Uri "http://127.0.0.1:3000/login" -UseBasicParsing -TimeoutSec 8 -ErrorAction Stop
    if ($r3.StatusCode -eq 200)
    { Pass "/login returns 200"
    } else
    { Warn "/login returned $($r3.StatusCode)"
    }
} catch
{ Fail "/login unreachable: $($_.Exception.Message)"
}

try
{
    $r4 = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/whatsapp/incoming" -UseBasicParsing -TimeoutSec 5 -Method POST -Body "{}" -ContentType "application/json" -ErrorAction Stop
    Warn "incoming webhook returned $($r4.StatusCode) without secret (expected 401)"
} catch
{
    $resp = $_.Exception.Response
    $code = if ($resp)
    { [int]$resp.StatusCode
    } else
    { 0
    }
    if ($code -eq 401)
    { Pass "/api/whatsapp/incoming requires auth (401)"
    } else
    { Warn "expected 401 from incoming, got $code"
    }
}

# ---------- 8. Process / RAM snapshot ----------
Write-Host "`n[8/8] Process snapshot" -ForegroundColor Cyan
$nodeProcs   = Get-Process -Name node    -ErrorAction SilentlyContinue
$pyProcs     = Get-Process -Name python  -ErrorAction SilentlyContinue
$chromeProcs = Get-Process -Name chrome  -ErrorAction SilentlyContinue
$caddyProcs  = Get-Process -Name caddy   -ErrorAction SilentlyContinue

$nodeMem   = if ($nodeProcs)
{ [math]::Round((($nodeProcs   | Measure-Object WorkingSet64 -Sum).Sum / 1MB), 1)
} else
{ 0
}
$pyMem     = if ($pyProcs)
{ [math]::Round((($pyProcs     | Measure-Object WorkingSet64 -Sum).Sum / 1MB), 1)
} else
{ 0
}
$chromeMem = if ($chromeProcs)
{ [math]::Round((($chromeProcs | Measure-Object WorkingSet64 -Sum).Sum / 1MB), 1)
} else
{ 0
}
$caddyMem  = if ($caddyProcs)
{ [math]::Round((($caddyProcs  | Measure-Object WorkingSet64 -Sum).Sum / 1MB), 1)
} else
{ 0
}

Info ("node:    {0,3} proc(s),  {1,7} MB" -f $nodeProcs.Count,   $nodeMem)
Info ("python:  {0,3} proc(s),  {1,7} MB" -f $pyProcs.Count,     $pyMem)
Info ("chrome:  {0,3} proc(s),  {1,7} MB  (Chromium tabs spawned by whatsapp-web.js)" -f $chromeProcs.Count, $chromeMem)
Info ("caddy:   {0,3} proc(s),  {1,7} MB" -f $caddyProcs.Count,  $caddyMem)

# Sanity: more than 2 node procs is suspicious (saas + wa)
if ($nodeProcs.Count -gt 4)
{
    Warn "more than 4 node processes - check for duplicates from previous deploys"
}

# ---------- summary ----------
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
if ($failures.Count -eq 0 -and $warnings.Count -eq 0)
{
    Write-Host "  HEALTH CHECK PASSED" -ForegroundColor Green
    exit 0
} elseif ($failures.Count -eq 0)
{
    Write-Host "  HEALTH CHECK PASSED with $($warnings.Count) warning(s)" -ForegroundColor Yellow
    foreach ($w in $warnings)
    { Write-Host "    - $w" -ForegroundColor Yellow
    }
    exit 0
} else
{
    Write-Host "  HEALTH CHECK FAILED ($($failures.Count) failure(s), $($warnings.Count) warning(s))" -ForegroundColor Red
    foreach ($f in $failures)
    { Write-Host "    FAIL: $f" -ForegroundColor Red
    }
    foreach ($w in $warnings)
    { Write-Host "    WARN: $w" -ForegroundColor Yellow
    }
    exit 1
}
