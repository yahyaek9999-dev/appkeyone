#!/usr/bin/env bash
set -euo pipefail

# RETIRED — this script rolls back on the old Windows VPS (Administrator@217.154.163.16),
# which is no longer production. Production is AWS Linux; roll back with
# deploy/release-aws.sh <previous-good-commit-sha> instead. See
# project-knowledge/DEPLOYMENT_RULES.md.
if [ -z "${I_KNOW_THIS_TARGETS_THE_RETIRED_WINDOWS_VPS:-}" ]; then
  echo "🛑 rollback-release.sh targets the RETIRED Windows VPS — production is now AWS." >&2
  echo "   Use deploy/release-aws.sh <previous-good-sha> instead. See project-knowledge/DEPLOYMENT_RULES.md." >&2
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# rollback-release.sh — Roll back to previous release
#
# Swaps the current release for the backup in releases/previous.
# Usage:  ./deploy/rollback-release.sh
# ─────────────────────────────────────────────────────────────────────────────

SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
SSH_HOST="${SSH_HOST:-Administrator@217.154.163.16}"
APP_DIR="${APP_DIR:-C:\app}"
SERVICE_NAME="${SERVICE_NAME:-mse-saas}"

echo "→ Rolling back on $SSH_HOST…"

ssh -i "$SSH_KEY" -p "${SSH_PORT:-22}" "$SSH_HOST" powershell.exe -Command "
  \$ErrorActionPreference = 'Stop'
  \$appDir = '${APP_DIR}'
  \$backup = Join-Path \$appDir 'releases\previous'

  if (!(Test-Path \$backup)) {
    Write-Host '❌ No backup found at' \$backup
    exit 1
  }

  Write-Host '→ Stopping service…'
  nssm stop '${SERVICE_NAME}'
  Start-Sleep 2
  Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep 1

  Write-Host '→ Replacing…'
  if (Test-Path \"\$appDir\saas\.next\") { Remove-Item -Recurse -Force \"\$appDir\saas\.next\" }
  if (Test-Path \"\$appDir\saas\node_modules\") { Remove-Item -Recurse -Force \"\$appDir\saas\node_modules\" }

  Copy-Item \"\$backup\.next\" \"\$appDir\saas\.next\" -Recurse
  Copy-Item \"\$backup\node_modules\" \"\$appDir\saas\node_modules\" -Recurse -ErrorAction SilentlyContinue

  Write-Host '→ Starting service…'
  nssm start '${SERVICE_NAME}'
  Start-Sleep 5
  \$s = nssm status '${SERVICE_NAME}'
  if (\$s -ne 'SERVICE_RUNNING') { throw \"Service status: \$s\" }
  Write-Host '✅ Rollback complete'
"
