[CmdletBinding()]
param([string]$InstallDir = "C:\app")
$ErrorActionPreference = "Stop"
$SaasStarted = $false
function Ok($m)
{ Write-Host "  [OK]   $m" -ForegroundColor Green 
}
function Section($m)
{ Write-Host ""; Write-Host "============================================" -ForegroundColor Magenta; Write-Host "  $m" -ForegroundColor Magenta; Write-Host "============================================" -ForegroundColor Magenta 
}
try
{
    Section "Backup"
    & "$InstallDir\deploy\backup-all.ps1" -InstallDir $InstallDir
    if ($LASTEXITCODE -ne 0)
    { throw "backup failed" 
    }
    Ok "backup complete"

    Section "Stop mse-saas"
    & nssm stop mse-saas; Start-Sleep -Seconds 4
    Ok "stopped"

    Section "Build"
    Push-Location "$InstallDir\saas"
    try
    { & npm run build; if ($LASTEXITCODE -ne 0)
        { throw "build failed" 
        } 
    } finally
    { Pop-Location 
    }
    Ok "build complete"

    Section "Start mse-saas"
    & nssm start mse-saas; $SaasStarted = $true; Start-Sleep -Seconds 15
    Ok "started"

    Section "Smoke test"
    $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3000" -TimeoutSec 30
    if ($r.StatusCode -lt 200 -or $r.StatusCode -ge 400)
    { throw "HTTP $($r.StatusCode)" 
    }
    Ok "HTTP $($r.StatusCode)"

    Write-Host ""; Write-Host "============================================" -ForegroundColor Green
    Write-Host "  DEPLOY SUCCEEDED" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
} catch
{
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
    if (-not $SaasStarted)
    { try
        { & nssm start mse-saas 
        } catch
        {
        } 
    }
    exit 1
}
