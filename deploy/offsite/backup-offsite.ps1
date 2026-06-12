# ─────────────────────────────────────────────────────────────────────────────
# KEYONE — Off-site encrypted backup (Windows VPS — CURRENT production)
#
# Windows-native equivalent of backup-offsite.sh. Bundles → encrypts → uploads:
#   • SQLite DB (online .backup via sqlite3.exe)
#   • WhatsApp sessions (SESSIONS_DIR)
#   • Uploads (if any; KEYONE stores none)
#   • Env files (saas\.env, whatsapp-service\.env, root .env)
#
# Encryption: age.exe (recipient PUBLIC key only on the server).
# Transport : rclone.exe to any remote (B2 / R2 / S3 / GDrive).
#
# DOES NOT modify production. Read + copy only. Safe to schedule.
#
# Setup (one-time):
#   1. Download age.exe + rclone.exe to C:\tools, add to PATH (or set $Age/$Rclone).
#   2. rclone config           # create remote, e.g. "b2:keyone-backups"
#   3. age-keygen -o keyone-backup.key  (run OFF-server; keep private key in vault)
#      Put ONLY the public line into $AgeRecipient below / -AgeRecipient.
#
# Usage:
#   pwsh deploy\offsite\backup-offsite.ps1 -AgeRecipient age1xxxx -RcloneRemote b2:keyone-backups
#   pwsh deploy\offsite\backup-offsite.ps1 ... -Tier weekly
# ─────────────────────────────────────────────────────────────────────────────
param(
  [string]$DbPath        = "C:\KEYONE\data\saas.db",
  [string]$WaSessionsDir = "C:\KEYONE\data\wa-sessions",
  [string]$UploadsDir    = "C:\KEYONE\data\uploads",
  [string[]]$EnvFiles    = @("C:\app\saas\.env","C:\app\whatsapp-service\.env"),
  [Parameter(Mandatory=$true)][string]$AgeRecipient,
  [Parameter(Mandatory=$true)][string]$RcloneRemote,
  [string]$StagingDir    = "C:\app\backups\offsite",
  [ValidateSet("daily","weekly","monthly")][string]$Tier = "daily",
  [int]$RetainDailyDays  = 30,
  [int]$RetainWeeklyDays = 56,
  [int]$RetainMonthlyDays= 365,
  [string]$Sqlite3 = "sqlite3.exe",
  [string]$Age     = "age.exe",
  [string]$Rclone  = "rclone.exe"
)
$ErrorActionPreference = "Stop"
function Log($m){ Write-Host ("[{0}] {1}" -f (Get-Date -Format HH:mm:ss), $m) }

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$name  = "keyone-$Tier-$stamp"
$work  = Join-Path $env:TEMP $name
New-Item -ItemType Directory -Force -Path $work, $StagingDir | Out-Null

try {
  # 1. DB online snapshot
  if (Test-Path $DbPath) {
    Log "DB snapshot -> $DbPath"
    & $Sqlite3 $DbPath ".backup '$($work -replace '\\','/')/saas.db'"
    & $Sqlite3 (Join-Path $work "saas.db") "PRAGMA integrity_check;" | Select-Object -First 1
  } else { Log "WARN: DB not found at $DbPath" }

  # 2. WhatsApp sessions
  if (Test-Path $WaSessionsDir) {
    Log "WA sessions -> $WaSessionsDir"
    Compress-Archive -Path "$WaSessionsDir\*" -DestinationPath (Join-Path $work "wa-sessions.zip") -Force
  } else { Log "WA sessions dir absent — skipping" }

  # 3. Uploads (none expected)
  if ((Test-Path $UploadsDir) -and (Get-ChildItem $UploadsDir -Force -ErrorAction SilentlyContinue)) {
    Log "Uploads -> $UploadsDir"
    Compress-Archive -Path "$UploadsDir\*" -DestinationPath (Join-Path $work "uploads.zip") -Force
  } else { Log "No uploads on disk — skipping (expected)" }

  # 4. Env files (encrypted because they hold AUTH_SECRET)
  $envDir = Join-Path $work "env"; New-Item -ItemType Directory -Force -Path $envDir | Out-Null
  foreach ($f in $EnvFiles) {
    if (Test-Path $f) { Copy-Item $f (Join-Path $envDir ($f -replace '[\\:]','_')); Log "env -> $f" }
  }

  # 5. Manifest
  $man = Join-Path $work "manifest.txt"
  "name=$name`ntier=$Tier`nutc=$stamp`nhost=$env:COMPUTERNAME" | Set-Content $man
  "--- sha256 ---" | Add-Content $man
  Get-ChildItem $work -Recurse -File | Where-Object Name -ne "manifest.txt" | ForEach-Object {
    "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash)  $($_.FullName.Substring($work.Length))" | Add-Content $man
  }

  # 6. Bundle + encrypt
  Log "Bundling…"
  $bundle = Join-Path $StagingDir "$name.tar"   # use tar (ships with Windows 10+) to preserve a single archive
  tar -cf $bundle -C $work .
  Log "Encrypting with age ($($AgeRecipient.Substring(0,[Math]::Min(12,$AgeRecipient.Length)))…)"
  & $Age -r $AgeRecipient -o "$bundle.age" $bundle
  Remove-Item $bundle -Force   # never keep plaintext bundle

  # 7. Upload + verify
  Log "Uploading -> $RcloneRemote/$Tier/"
  & $Rclone copy "$bundle.age" "$RcloneRemote/$Tier/" --no-traverse
  & $Rclone check "$bundle.age" "$RcloneRemote/$Tier/" --one-way
  if ($LASTEXITCODE -ne 0) { throw "remote verification failed" }

  # 8. Remote retention
  $days = switch ($Tier) { "weekly" {$RetainWeeklyDays} "monthly" {$RetainMonthlyDays} default {$RetainDailyDays} }
  Log "Pruning $RcloneRemote/$Tier/ older than ${days}d"
  & $Rclone delete "$RcloneRemote/$Tier/" --min-age "${days}d"

  # Local staging retention: keep last 3 per tier
  Get-ChildItem "$StagingDir\keyone-$Tier-*.tar.age" | Sort-Object LastWriteTime -Desc |
    Select-Object -Skip 3 | Remove-Item -Force -ErrorAction SilentlyContinue

  Log "✅ Off-site backup complete: $name.tar.age"
}
finally {
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
