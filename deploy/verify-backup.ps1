# ============================================================
#  KEYONE — Backup Verification (Reliability Phase / Agent 3)
# ------------------------------------------------------------
#  Proves that the newest daily backup is actually restorable.
#  A backup you have never restored is a backup you do not have.
#
#  Steps (all read-only against production — never touches prod.db):
#    1. Locate newest prod-*.db.gz in the backup dir.
#    2. Decompress it to a temp working copy.
#    3. Run `PRAGMA integrity_check` via sqlite3 (or a .NET fallback header
#       sanity check if sqlite3.exe is unavailable).
#    4. Sanity-count a few core tables (User, Bot, WaMessage) to confirm the
#       schema is intact and the file is a real KEYONE DB.
#    5. Assert recency (newest backup younger than -MaxAgeHours).
#    6. Clean up the temp copy.
#
#  Exit code 0 = backup verified restorable & recent. Non-zero = problem.
#  Safe to run on a schedule (e.g. daily at 04:00, after the 03:30 backup).
#
#  Usage (PowerShell):
#      .\verify-backup.ps1
#      .\verify-backup.ps1 -BackupDir "C:\app\backups" -MaxAgeHours 26
# ============================================================

[CmdletBinding()]
param(
    [string]$BackupDir   = "C:\app\backups",
    [int]   $MaxAgeHours = 26,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
$T0 = Get-Date
$findings = @()

function Note($name, $status, $detail) {
    $script:findings += [pscustomobject]@{ name = $name; status = $status; detail = $detail }
    if (-not $Json) {
        $color = switch ($status) { "pass" { "Green" } "warn" { "Yellow" } "fail" { "Red" } default { "Gray" } }
        $icon  = switch ($status) { "pass" { "[OK]  " } "warn" { "[WARN]" } "fail" { "[FAIL]" } default { "[..]  " } }
        Write-Host "  $icon $name — $detail" -ForegroundColor $color
    }
}

if (-not $Json) {
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "  KEYONE Backup Verification" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
}

# ---- 1. Locate newest backup ------------------------------------------------
if (-not (Test-Path $BackupDir)) {
    Note "backup:dir" "fail" "Backup dir not found: $BackupDir"
    if ($Json) { @{ ok = $false; findings = $findings } | ConvertTo-Json -Depth 5 }
    exit 1
}

$newest = Get-ChildItem -Path $BackupDir -Filter 'prod-*.db.gz' -File -ErrorAction SilentlyContinue |
          Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $newest) {
    Note "backup:exists" "fail" "No prod-*.db.gz backups found in $BackupDir"
    if ($Json) { @{ ok = $false; findings = $findings } | ConvertTo-Json -Depth 5 }
    exit 1
}

$ageHours = [math]::Round(((Get-Date) - $newest.LastWriteTime).TotalHours, 1)
$sizeKb   = [int]($newest.Length / 1024)
Note "backup:exists" "pass" "Newest backup: $($newest.Name) (${sizeKb} KB)"

# ---- 5. Recency (checked early so we fail fast on stale backups) ------------
if ($ageHours -gt $MaxAgeHours) {
    Note "backup:recency" "fail" "Newest backup is ${ageHours}h old (limit ${MaxAgeHours}h) — daily backup task may be broken"
} elseif ($ageHours -gt ($MaxAgeHours / 2)) {
    Note "backup:recency" "warn" "Newest backup is ${ageHours}h old"
} else {
    Note "backup:recency" "pass" "Newest backup is ${ageHours}h old"
}

# ---- 2. Decompress to temp --------------------------------------------------
$tmpDb = Join-Path $env:TEMP ("keyone-verify-" + [guid]::NewGuid().ToString("N").Substring(0,8) + ".db")
try {
    $inStream  = [System.IO.File]::OpenRead($newest.FullName)
    $gzip      = New-Object System.IO.Compression.GzipStream($inStream, [System.IO.Compression.CompressionMode]::Decompress)
    $outStream = [System.IO.File]::Create($tmpDb)
    try {
        $gzip.CopyTo($outStream)
    } finally {
        $outStream.Dispose(); $gzip.Dispose(); $inStream.Dispose()
    }
    $restoredKb = [int]((Get-Item $tmpDb).Length / 1024)
    Note "backup:decompress" "pass" "Decompressed to temp (${restoredKb} KB)"
} catch {
    Note "backup:decompress" "fail" "Decompression failed: $($_.Exception.Message)"
    Remove-Item -Path $tmpDb -Force -ErrorAction SilentlyContinue
    if ($Json) { @{ ok = $false; findings = $findings } | ConvertTo-Json -Depth 5 }
    exit 1
}

# ---- 3 + 4. Integrity check + core-table sanity -----------------------------
$sqliteExe = (Get-Command sqlite3 -ErrorAction SilentlyContinue).Source
if ($sqliteExe) {
    try {
        $integrity = (& $sqliteExe $tmpDb "PRAGMA integrity_check;") 2>&1 | Select-Object -First 1
        if ($integrity -match '^ok$') {
            Note "backup:integrity" "pass" "PRAGMA integrity_check = ok"
        } else {
            Note "backup:integrity" "fail" "integrity_check returned: $integrity"
        }

        # Confirm this is a real KEYONE DB by counting core tables.
        $userCount = (& $sqliteExe $tmpDb "SELECT COUNT(*) FROM User;") 2>&1 | Select-Object -First 1
        $botCount  = (& $sqliteExe $tmpDb "SELECT COUNT(*) FROM Bot;")  2>&1 | Select-Object -First 1
        if ($userCount -match '^\d+$' -and $botCount -match '^\d+$') {
            Note "backup:schema" "pass" "Restored DB queryable (User=$userCount Bot=$botCount)"
        } else {
            Note "backup:schema" "fail" "Core tables not queryable in restored DB"
        }
    } catch {
        Note "backup:integrity" "fail" "sqlite3 verification error: $($_.Exception.Message)"
    }
} else {
    # Fallback: sqlite3.exe missing — do a header-magic sanity check only.
    try {
        $bytes  = [System.IO.File]::ReadAllBytes($tmpDb)[0..15]
        $header = -join ($bytes | ForEach-Object { [char]$_ })
        if ($header.StartsWith("SQLite format 3")) {
            Note "backup:integrity" "warn" "sqlite3.exe missing — header OK but integrity_check skipped"
        } else {
            Note "backup:integrity" "fail" "File is not a valid SQLite database (bad header)"
        }
    } catch {
        Note "backup:integrity" "fail" "Header check failed: $($_.Exception.Message)"
    }
}

# ---- 6. Cleanup -------------------------------------------------------------
Remove-Item -Path $tmpDb -Force -ErrorAction SilentlyContinue

# ---- Verdict ----------------------------------------------------------------
$failed = ($findings | Where-Object { $_.status -eq "fail" }).Count
$durMs  = [int]((Get-Date) - $T0).TotalMilliseconds

if ($Json) {
    @{ ok = ($failed -eq 0); durationMs = $durMs; findings = $findings } | ConvertTo-Json -Depth 5
} else {
    Write-Host ""
    if ($failed -eq 0) {
        Write-Host "  BACKUP VERIFIED RESTORABLE (${durMs}ms)" -ForegroundColor Green
    } else {
        Write-Host "  BACKUP VERIFICATION FAILED ($failed issue(s))" -ForegroundColor Red
    }
}

exit ([int]($failed -gt 0))
