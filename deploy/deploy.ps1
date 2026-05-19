Write-Host 'Backing up DB...' -ForegroundColor Cyan
Copy-Item 'C:\app\saas\prisma\prod.db' 'C:\app\backups\pre-scaling.db' -Force

Write-Host 'Stopping mse-saas...' -ForegroundColor Cyan
nssm stop mse-saas
Start-Sleep 5

Write-Host 'Building...' -ForegroundColor Cyan
Set-Location 'C:\app\saas'
npm run build 2>&1
if ($LASTEXITCODE -ne 0)
{ throw 'Build failed!' 
}

Write-Host 'Starting mse-saas...' -ForegroundColor Cyan
nssm start mse-saas
Start-Sleep 15

Write-Host 'Smoke test...' -ForegroundColor Cyan
try
{
    $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000' -TimeoutSec 30
    Write-Host ("HTTP " + $r.StatusCode) -ForegroundColor Green
    Write-Host 'DEPLOY SUCCEEDED' -ForegroundColor Green
} catch
{
    Write-Host 'Smoke test FAILED' -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}
