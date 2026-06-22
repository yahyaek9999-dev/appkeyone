# ─────────────────────────────────────────────────────────────────────────────
# run-cron.ps1 — generic KEYONE cron runner invoked by the KEYONE-Cron-* tasks.
#
# POSTs to a cron route on the local app with the internal secret. One runner for
# every cron, parameterised by route. -Repeat/-SleepSec let a 1-minute task
# approximate a sub-minute cadence (e.g. the Meta webhook processor at ~30s).
#
#   powershell -File C:\app\run-cron.ps1 -Path '/api/cron/outgoing-messages' -Name 'outgoing-messages'
#   powershell -File C:\app\run-cron.ps1 -Path '/api/cron/meta-webhook-processor' -Name 'meta-webhook-processor' -Repeat 2 -SleepSec 30
# ─────────────────────────────────────────────────────────────────────────────
param(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][string]$Name,
  [int]$Repeat = 1,
  [int]$SleepSec = 0
)
$ErrorActionPreference = 'Continue'

$envFile = 'C:\app\saas\.env'
$logFile = "C:\app\logs\cron-$Name.log"
New-Item -ItemType Directory -Force -Path C:\app\logs | Out-Null

# Read SAAS_INTERNAL_SECRET (required) and PORT (default 3000) from the app .env.
$secret = ''
$port = '3000'
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if (-not $secret -and $line -match '^\s*SAAS_INTERNAL_SECRET\s*=\s*"?([^"]+)"?\s*$') { $secret = $Matches[1].Trim() }
    if ($line -match '^\s*PORT\s*=\s*"?(\d+)"?\s*$') { $port = $Matches[1].Trim() }
  }
}
if (-not $secret) {
  Add-Content -Path $logFile -Value ("{0}  ERR missing SAAS_INTERNAL_SECRET" -f (Get-Date -Format s))
  exit 1
}

$uri = "http://127.0.0.1:$port$Path"
for ($i = 0; $i -lt $Repeat; $i++) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $uri -Method POST -Headers @{ 'x-internal-secret' = $secret } -TimeoutSec 110
    $body = if ($r.Content) { $r.Content.Substring(0, [Math]::Min(160, $r.Content.Length)) } else { '' }
    Add-Content -Path $logFile -Value ("{0}  OK {1} {2}" -f (Get-Date -Format s), $r.StatusCode, $body)
  } catch {
    Add-Content -Path $logFile -Value ("{0}  ERR {1}" -f (Get-Date -Format s), $_.Exception.Message)
  }
  if ($SleepSec -gt 0 -and $i -lt ($Repeat - 1)) { Start-Sleep -Seconds $SleepSec }
}
