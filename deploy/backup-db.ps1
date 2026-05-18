# KEYONE — Daily DB backup
# Backs up the SaaS prod.db using SQLite's safe online backup,
# compresses it, and keeps the last 14 days.

$ErrorActionPreference = 'Stop'

$dbPath     = 'C:\app\saas\prisma\prod.db'
$backupDir  = 'C:\app\backups'
$retention  = 14   # days
$stamp      = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$logFile    = Join-Path $backupDir 'backup.log'

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

function Write-Log($msg) {
    $line = "$(Get-Date -Format 's')  $msg"
    Add-Content -Path $logFile -Value $line
    Write-Host $line
}

if (-not (Test-Path $dbPath)) {
    Write-Log "ERROR: DB not found at $dbPath"
    exit 1
}

$tmp = Join-Path $backupDir "prod-$stamp.db"
$out = "$tmp.gz"

try {
    # Use SQLite's .backup command for a consistent snapshot even while
    # the SaaS service is writing. Fallback to file copy if sqlite3.exe is missing.
    $sqliteExe = (Get-Command sqlite3 -ErrorAction SilentlyContinue).Source
    if ($sqliteExe) {
        & $sqliteExe $dbPath ".backup '$tmp'"
        if ($LASTEXITCODE -ne 0) { throw "sqlite3 .backup failed (exit $LASTEXITCODE)" }
    } else {
        Copy-Item -Path $dbPath -Destination $tmp -Force
    }

    # Gzip the snapshot using .NET (no external dependency)
    $inStream  = [System.IO.File]::OpenRead($tmp)
    $outStream = [System.IO.File]::Create($out)
    $gzip      = New-Object System.IO.Compression.GzipStream($outStream, [System.IO.Compression.CompressionLevel]::Optimal)
    try {
        $inStream.CopyTo($gzip)
    } finally {
        $gzip.Dispose()
        $outStream.Dispose()
        $inStream.Dispose()
    }
    Remove-Item -Path $tmp -Force -ErrorAction SilentlyContinue

    $sizeKb = [int]((Get-Item $out).Length / 1024)
    Write-Log "OK  $out  (${sizeKb} KB)"
} catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    Remove-Item -Path $tmp -Force -ErrorAction SilentlyContinue
    exit 1
}

# Retention: keep last $retention days
$cutoff = (Get-Date).AddDays(-$retention)
$old = Get-ChildItem -Path $backupDir -Filter 'prod-*.db.gz' -File |
       Where-Object { $_.LastWriteTime -lt $cutoff }
foreach ($f in $old) {
    Remove-Item -Path $f.FullName -Force -ErrorAction SilentlyContinue
    Write-Log "DELETED old backup: $($f.Name)"
}

# Also trim the log to the last 1000 lines to keep it bounded
try {
    $tail = Get-Content $logFile -Tail 1000
    Set-Content -Path $logFile -Value $tail -Encoding UTF8
} catch {}
