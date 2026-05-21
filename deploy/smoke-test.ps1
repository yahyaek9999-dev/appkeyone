param([string]$Base = "http://127.0.0.1:3000", [string]$WaBase = "http://127.0.0.1:3001")

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$pass = 0; $fail = 0

function Test-Endpoint
{
    param([string]$Label, [string]$Url, [string]$Method = "GET", [hashtable]$Headers = @{})
    try
    {
        $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -Method $Method -Headers $Headers -TimeoutSec 15 -ErrorAction Stop
        Write-Host ("[PASS] " + $Label + " => " + $r.StatusCode) -ForegroundColor Green
        $script:pass++
    } catch
    {
        $code = 0
        try
        { $code = $_.Exception.Response.StatusCode.value__ 
        } catch
        {
        }
        if ($code -in @(401, 403))
        {
            Write-Host ("[PASS] " + $Label + " => " + $code + " (auth-gated, expected)") -ForegroundColor Green
            $script:pass++
        } elseif ($code -gt 0)
        {
            Write-Host ("[FAIL] " + $Label + " => HTTP " + $code) -ForegroundColor Red
            $script:fail++
        } else
        {
            Write-Host ("[FAIL] " + $Label + " => " + $_.Exception.Message) -ForegroundColor Red
            $script:fail++
        }
    }
}

Write-Host ""
Write-Host "=== KEYONE Production Smoke Tests ===" -ForegroundColor Cyan
Write-Host "   SaaS:  $Base" -ForegroundColor Gray
Write-Host "   WA:    $WaBase" -ForegroundColor Gray
Write-Host ""

# Read internal secret
$secret = ""
$envFile = "C:\app\saas\.env"
if (Test-Path $envFile)
{
    $line = Select-String -Path $envFile -Pattern "^SAAS_INTERNAL_SECRET=" | Select-Object -First 1 -ExpandProperty Line
    if ($line)
    { $secret = $line.Replace("SAAS_INTERNAL_SECRET=","").Trim('"').Trim("'").Trim() 
    }
}
Write-Host "Internal secret: $(if ($secret) { 'found' } else { 'NOT FOUND' })" -ForegroundColor Gray
Write-Host ""

# --- Core health ---
Test-Endpoint "SaaS /api/health"                "$Base/api/health"
Test-Endpoint "WA  /health"                     "$WaBase/health"

# --- Auth-gated endpoints (all return 401/403 without a session) ---
Test-Endpoint "/api/escalations"                "$Base/api/escalations"
Test-Endpoint "/api/usage/audit"                "$Base/api/usage/audit"
Test-Endpoint "/api/inbox/conversations"        "$Base/api/inbox/conversations"
Test-Endpoint "/api/knowledge-gaps"             "$Base/api/knowledge-gaps"
Test-Endpoint "/api/orders"                     "$Base/api/orders"
Test-Endpoint "/api/commerce/integrations"      "$Base/api/commerce/integrations"
Test-Endpoint "/api/intel"                      "$Base/api/intel"
Test-Endpoint "/api/analytics"                  "$Base/api/analytics"
Test-Endpoint "/dashboard/escalations"          "$Base/dashboard/escalations"
Test-Endpoint "/dashboard/safety"               "$Base/dashboard/safety"

# --- Internal cron endpoints (require secret header) ---
if ($secret)
{
    $h = @{ "x-internal-secret" = $secret }
    Test-Endpoint "/api/cron/follow-ups (POST)"  "$Base/api/cron/follow-ups"     "POST" $h
    # daily-report dry-run
    Test-Endpoint "/api/cron/daily-report dryRun" "$Base/api/cron/daily-report?dryRun=1" "POST" $h
    # queue-health check
    Test-Endpoint "/api/internal/queue-health"    "$Base/api/internal/queue-health"
} else
{
    Write-Host "[SKIP] Cron tests skipped (no secret)" -ForegroundColor Yellow
}

# --- Public pages ---
Test-Endpoint "/login"                          "$Base/login"
Test-Endpoint "/pricing"                        "$Base/pricing"

# --- WA service JSON ---
try
{
    $waResp = Invoke-WebRequest -UseBasicParsing -Uri "$WaBase/health" -TimeoutSec 10
    $waJson = $waResp.Content | ConvertFrom-Json
    Write-Host ""
    Write-Host "WA sessions:" -ForegroundColor Cyan
    foreach ($s in $waJson.sessions)
    {
        Write-Host ("  [" + $s.id + "] status=" + $s.status + " phone=" + $s.phone) -ForegroundColor Gray
    }
} catch
{
    Write-Host "WA health parse failed: $($_.Exception.Message)" -ForegroundColor Yellow
}

# --- Summary ---
Write-Host ""
Write-Host "=== Summary: $pass PASS  $fail FAIL ===" -ForegroundColor $(if ($fail -gt 0)
    { "Red" 
    } else
    { "Green" 
    })
Write-Host ""

if ($fail -gt 0)
{ exit 1 
} else
{ exit 0 
}
