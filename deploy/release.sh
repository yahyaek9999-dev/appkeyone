#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# release.sh — Upload artifact to VPS & restart service
#
# Usage:  ./deploy/release.sh                     # release.tar.gz
#         ./deploy/release.sh my-build.tar.gz
#         ./deploy/release.sh --skip-build         # build then release
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
SSH_HOST="${SSH_HOST:-Administrator@217.154.163.16}"
SSH_PORT="${SSH_PORT:-22}"
APP_DIR="${APP_DIR:-C:\\app}"
RELEASES_DIR="${RELEASES_DIR:-C:\\app\\releases}"
SERVICE_NAME="${SERVICE_NAME:-mse-saas}"
ARCHIVE="${1:-release.tar.gz}"

# Build if needed
if [ ! -f "$ROOT_DIR/$ARCHIVE" ]; then
  bash "$SCRIPT_DIR/build.sh"
  ARCHIVE="release.tar.gz"
fi

ARCHIVE_PATH="$ROOT_DIR/$ARCHIVE"
if [ ! -f "$ARCHIVE_PATH" ]; then
  echo "Artifact not found: $ARCHIVE_PATH"
  exit 1
fi

echo "Artifact: $ARCHIVE ($(du -h "$ARCHIVE_PATH" | cut -f1))"

# Upload to VPS
echo "Uploading..."
scp -i "$SSH_KEY" -P "$SSH_PORT" "$ARCHIVE_PATH" "${SSH_HOST}:${RELEASES_DIR}/"

# Build PowerShell script locally to avoid quoting issues
PS_SCRIPT=$(cat <<-'ENDSCRIPT'
Write-Host 'Extracting...'
$archive = Join-Path '__RELEASES_DIR__' '__ARCHIVE__'
$tmp = Join-Path '__RELEASES_DIR__' 'extract'
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
tar -xzf $archive -C $tmp
Remove-Item $archive -Force
$relName = (Get-ChildItem $tmp | Select-Object -First 1).Name
$relPath = Join-Path $tmp $relName

# Keep 3 latest releases
$existing = Get-ChildItem '__RELEASES_DIR__' -Directory | Where-Object { $_.Name -ne 'extract' } | Sort-Object LastWriteTime
while ($existing.Count -gt 3) { Remove-Item -Recurse -Force $existing[0].FullName; $existing = Get-ChildItem '__RELEASES_DIR__' -Directory | Where-Object { $_.Name -ne 'extract' } | Sort-Object LastWriteTime }

Write-Host 'Stopping service...'
nssm stop '__SERVICE_NAME__'
Start-Sleep 2
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 1

# Backup current for rollback
$backup = Join-Path '__RELEASES_DIR__' 'previous'
if (Test-Path $backup) { Remove-Item -Recurse -Force $backup }
if (Test-Path '__APP_DIR__\\saas\\.next') {
  New-Item -ItemType Directory -Path $backup -Force | Out-Null
  Copy-Item '__APP_DIR__\\saas\\.next' $backup -Recurse
  Copy-Item '__APP_DIR__\\saas\\node_modules' $backup -Recurse -ErrorAction SilentlyContinue
}

# Swap release
if (Test-Path '__APP_DIR__\\saas\\.next') { Remove-Item -Recurse -Force '__APP_DIR__\\saas\\.next' }
if (Test-Path '__APP_DIR__\\saas\\node_modules') { Remove-Item -Recurse -Force '__APP_DIR__\\saas\\node_modules' }
Copy-Item "$relPath\\*" '__APP_DIR__\\saas' -Recurse -Force

Write-Host 'Prisma...'
Set-Location '__APP_DIR__\\saas'
if (!(Test-Path '.\node_modules\.bin\prisma.cmd') -and !(Test-Path '.\node_modules\.bin\prisma')) {
  npm install prisma@5.22.0 --no-save --no-audit --no-fund
}
$prisma = if (Test-Path '.\node_modules\.bin\prisma.cmd') { '.\node_modules\.bin\prisma.cmd' } else { '.\node_modules\.bin\prisma' }
& $prisma generate
& $prisma db push --skip-generate --accept-data-loss

Write-Host 'Starting service...'
nssm start '__SERVICE_NAME__'
Start-Sleep 5
$s = nssm status '__SERVICE_NAME__'
if ($s -ne 'SERVICE_RUNNING') { throw "Service status: $s" }
Write-Host 'Deployed'
ENDSCRIPT
)

PS_SCRIPT=${PS_SCRIPT//__RELEASES_DIR__/$RELEASES_DIR}
PS_SCRIPT=${PS_SCRIPT//__ARCHIVE__/$ARCHIVE}
PS_SCRIPT=${PS_SCRIPT//__SERVICE_NAME__/$SERVICE_NAME}
PS_SCRIPT=${PS_SCRIPT//__APP_DIR__/$APP_DIR}

# Write script to temp file and execute via SSH
SCRIPT_PATH=$(mktemp)
echo "$PS_SCRIPT" > "$SCRIPT_PATH"

echo "Deploying..."
ssh -i "$SSH_KEY" -p "$SSH_PORT" "$SSH_HOST" powershell.exe -File - < "$SCRIPT_PATH"

rm -f "$SCRIPT_PATH"
echo "Deploy complete"
