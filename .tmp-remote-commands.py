import base64

commands = {
    "manual_deploy_saas": r"""
$ErrorActionPreference = "Stop"
Set-Location C:\app
Write-Host "== git pull =="
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Set-Location C:\app\saas
Write-Host "== npm ci =="
npm ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "== prisma validate =="
npx prisma validate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "== prisma db push =="
npx prisma db push --skip-generate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "== prisma generate =="
npx prisma generate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "== tsc =="
npx tsc -p tsconfig.json --noEmit
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "== clear cache =="
if (Test-Path .next\cache) { Remove-Item .next\cache -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host "== build =="
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "== restart saas =="
nssm restart mse-saas
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Start-Sleep 15

Write-Host "== health =="
try {
  $res = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 20
  Write-Host $res.Content
  exit 0
} catch {
  Write-Host $_.Exception.Message
  exit 1
}
""",
    "verify_basic": r"""
Set-Location C:\app
Write-Host "HEAD"; git rev-parse HEAD
Write-Host "ORIGIN"; git rev-parse origin/main
Write-Host "SERVICES"; nssm status mse-saas; nssm status mse-wa
Write-Host "HEALTH"; try { (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 20).Content } catch { Write-Host $_.Exception.Message; exit 1 }
""",
    "queue_health": r"""
Set-Location C:\app\saas
$envLine = Get-Content .env | Where-Object { $_ -match '^SAAS_INTERNAL_SECRET=' } | Select-Object -First 1
$secret = ($envLine -replace '^SAAS_INTERNAL_SECRET=', '').Trim().Trim('"').Trim("'")
Write-Host "QUEUE_HEALTH"
try {
  (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/cron/outgoing-messages' -Headers @{ 'x-internal-secret' = $secret } -TimeoutSec 20).Content
} catch {
  Write-Host $_.Exception.Message
  exit 1
}
""",
    "wa_stats": r"""
Set-Location C:\app\whatsapp-service
$envLine = Get-Content .env | Where-Object { $_ -match '^SAAS_INTERNAL_SECRET=' } | Select-Object -First 1
$secret = ($envLine -replace '^SAAS_INTERNAL_SECRET=', '').Trim().Trim('"').Trim("'")
Write-Host "WA_HEALTH"
try { (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:7799/health' -TimeoutSec 10).Content } catch { Write-Host $_.Exception.Message }
Write-Host "WA_STATS"
try { (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:7799/sessions/stats' -Headers @{ 'x-internal-secret' = $secret } -TimeoutSec 10).Content } catch { Write-Host $_.Exception.Message; exit 1 }
""",
    "restart_wa": r"""
$ErrorActionPreference = "Stop"
Write-Host "== restart whatsapp service =="
nssm restart mse-wa
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Start-Sleep 20
Set-Location C:\app\whatsapp-service
$envLine = Get-Content .env | Where-Object { $_ -match '^SAAS_INTERNAL_SECRET=' } | Select-Object -First 1
$secret = ($envLine -replace '^SAAS_INTERNAL_SECRET=', '').Trim().Trim('"').Trim("'")
Write-Host "WA_HEALTH_AFTER_RESTART"
(Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:7799/health' -TimeoutSec 20).Content
Write-Host "WA_STATS_AFTER_RESTART"
(Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:7799/sessions/stats' -Headers @{ 'x-internal-secret' = $secret } -TimeoutSec 20).Content
""",
}

for name, cmd in commands.items():
    print(name)
    print(base64.b64encode(cmd.encode("utf-16le")).decode())
