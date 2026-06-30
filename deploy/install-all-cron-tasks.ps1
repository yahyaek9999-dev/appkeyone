# ─────────────────────────────────────────────────────────────────────────────
# install-all-cron-tasks.ps1 — register Windows Scheduled Tasks for EVERY KEYONE
# cron route. This is the single source of truth for cron scheduling on the VPS.
#
# Why: the app has 21 cron routes (Meta webhook processor, outbound drain, payments
# reconcile, QR scheduler, monthly credits, daily report, …) but only 4 had task
# installers — the other 17 silently never ran in production. This registers all of
# them (POST + x-internal-secret via run-cron.ps1) at their documented cadences.
#
# Run once on the VPS after deploy (it is idempotent — re-running replaces tasks):
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\app\install-all-cron-tasks.ps1
#
# Cadence source: each route's header comment in saas/app/api/cron/<name>/route.ts.
# Windows Task Scheduler's finest standard granularity is 1 minute; sub-minute
# routes use run-cron.ps1 -Repeat/-SleepSec to approximate.
# ─────────────────────────────────────────────────────────────────────────────
$ErrorActionPreference = 'Continue'

$runner = 'C:\app\run-cron.ps1'
if (-not (Test-Path $runner)) {
  Write-Host "ERROR: $runner not found. Deploy run-cron.ps1 to C:\app first." -ForegroundColor Red
  exit 1
}
New-Item -ItemType Directory -Force -Path C:\app\logs | Out-Null

# Supersede the 4 legacy single-cron tasks so nothing double-runs.
$legacy = @('KEYONE-Broadcasts', 'KEYONE-Automations', 'KEYONE-Follow-Ups', 'KEYONE-Abandoned-Cart')
foreach ($t in $legacy) {
  cmd /c "schtasks /Query /TN $t >nul 2>&1"
  if ($LASTEXITCODE -eq 0) {
    cmd /c "schtasks /Delete /TN $t /F >nul 2>&1"
    Write-Host "Removed legacy task: $t (superseded by KEYONE-Cron-*)" -ForegroundColor DarkYellow
  }
}

# Each entry: Name, route Path, schedule spec, optional extra runner args.
# sc/mo/st map to schtasks: MINUTE|HOURLY|DAILY|MONTHLY + /MO interval + /ST start.
$crons = @(
  @{ name = 'meta-webhook-processor'; path = '/api/cron/meta-webhook-processor'; sc = 'MINUTE'; mo = 1;  extra = @('-Repeat','2','-SleepSec','30') }
  @{ name = 'outgoing-messages';      path = '/api/cron/outgoing-messages';      sc = 'MINUTE'; mo = 1  }
  @{ name = 'broadcasts';             path = '/api/cron/broadcasts';             sc = 'MINUTE'; mo = 1  }
  @{ name = 'qr-scheduler';           path = '/api/cron/qr-scheduler';           sc = 'MINUTE'; mo = 1  }
  @{ name = 'qr-queue';               path = '/api/cron/qr-queue';               sc = 'MINUTE'; mo = 2  }
  @{ name = 'incident-scan';          path = '/api/cron/incident-scan';          sc = 'MINUTE'; mo = 15 }
  @{ name = 'automations';            path = '/api/cron/automations';            sc = 'MINUTE'; mo = 30 }
  @{ name = 'follow-ups';             path = '/api/cron/follow-ups';             sc = 'MINUTE'; mo = 30 }
  @{ name = 'meta-template-sync';     path = '/api/cron/meta-template-sync';     sc = 'MINUTE'; mo = 30 }
  @{ name = 'llm-prewarm';            path = '/api/cron/llm-prewarm';            sc = 'MINUTE'; mo = 30 }
  @{ name = 'abandoned-cart';         path = '/api/cron/abandoned-cart';         sc = 'HOURLY'; mo = 1  }
  @{ name = 'meta-quality-monitor';   path = '/api/cron/meta-quality-monitor';   sc = 'HOURLY'; mo = 1  }
  @{ name = 'payments-reconcile';     path = '/api/cron/payments-reconcile';     sc = 'HOURLY'; mo = 1  }
  @{ name = 'brain-learning';         path = '/api/cron/brain-learning';         sc = 'HOURLY'; mo = 6  }
  @{ name = 'trial-expiry';           path = '/api/cron/trial-expiry';           sc = 'HOURLY'; mo = 1  }
  @{ name = 'meta-cost';              path = '/api/cron/meta-cost';              sc = 'DAILY';  st = '02:00' }
  @{ name = 'product-affinity';       path = '/api/cron/product-affinity';       sc = 'DAILY';  st = '03:00' }
  @{ name = 'provider-maintenance';   path = '/api/cron/provider-maintenance';   sc = 'DAILY';  st = '03:30' }
  @{ name = 'catalog-sync';           path = '/api/cron/catalog-sync';           sc = 'DAILY';  st = '04:00' }
  @{ name = 'daily-report';           path = '/api/cron/daily-report';           sc = 'DAILY';  st = '23:55' }
  @{ name = 'credits-monthly';        path = '/api/cron/credits-monthly';        sc = 'MONTHLY'; st = '00:10' }
  @{ name = 'brain-credits-monthly';  path = '/api/cron/brain-credits-monthly';  sc = 'MONTHLY'; st = '00:20' }
)

$ok = 0; $fail = 0
foreach ($c in $crons) {
  $taskName = "KEYONE-Cron-$($c.name)"
  $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$runner`" -Path `"$($c.path)`" -Name `"$($c.name)`""
  if ($c.extra) { $argList += ' ' + ($c.extra -join ' ') }
  $action = "powershell.exe $argList"

  cmd /c "schtasks /Query /TN $taskName >nul 2>&1"
  if ($LASTEXITCODE -eq 0) { cmd /c "schtasks /Delete /TN $taskName /F >nul 2>&1" }

  $args = @('/Create', '/TN', $taskName, '/TR', $action, '/SC', $c.sc, '/RU', 'SYSTEM', '/RL', 'HIGHEST', '/F')
  if ($c.mo) { $args += @('/MO', "$($c.mo)") }
  if ($c.st) { $args += @('/ST', $c.st) }

  & schtasks @args | Out-Null
  if ($LASTEXITCODE -eq 0) {
    $when = if ($c.st) { "$($c.sc) @ $($c.st)" } else { "every $($c.mo) $($c.sc.ToLower())" }
    Write-Host ("  ✓ {0,-32} {1}" -f $taskName, $when) -ForegroundColor Green
    $ok++
  } else {
    Write-Host ("  ✗ {0} failed" -f $taskName) -ForegroundColor Red
    $fail++
  }
}

Write-Host ""
Write-Host "Installed $ok cron tasks ($fail failed). Logs: C:\app\logs\cron-*.log" -ForegroundColor Cyan
Write-Host "Verify with:  schtasks /Query /TN KEYONE-Cron-* /FO LIST" -ForegroundColor DarkGray
if ($fail -gt 0) { exit 1 }
