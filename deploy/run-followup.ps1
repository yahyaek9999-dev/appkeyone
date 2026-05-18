# Helper invoked by the Scheduled Task. Reads secret from .env then POSTs.
$ErrorActionPreference = 'Continue'

$envFile = 'C:\app\saas\.env'
$logFile = 'C:\app\logs\follow-ups.log'

New-Item -ItemType Directory -Force -Path C:\app\logs | Out-Null

$secret = ''
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*SAAS_INTERNAL_SECRET\s*=\s*"?([^"]+)"?\s*$') {
            $secret = $Matches[1].Trim()
            break
        }
    }
}
if (-not $secret) {
    Add-Content -Path $logFile -Value ("{0}  ERR: missing SAAS_INTERNAL_SECRET" -f (Get-Date -Format s))
    exit 1
}

try {
    $r = Invoke-WebRequest -UseBasicParsing `
        -Uri 'http://127.0.0.1:3000/api/cron/follow-ups' `
        -Method POST `
        -Headers @{ 'x-internal-secret' = $secret } `
        -TimeoutSec 60
    Add-Content -Path $logFile -Value ("{0}  OK {1} {2}" -f (Get-Date -Format s), $r.StatusCode, $r.Content.Substring(0,[Math]::Min(160,$r.Content.Length)))
} catch {
    Add-Content -Path $logFile -Value ("{0}  ERR {1}" -f (Get-Date -Format s), $_.Exception.Message)
}
