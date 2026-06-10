#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# release-git.sh — Server-side build deploy (minimal transfer).
#
# Instead of SCP-ing a ~1.8GB artifact (most of which is .next/cache + full
# node_modules), this transfers ONLY the git diff and builds on the VPS:
#
#   push ref → VPS: git fetch + reset → prisma generate → next build
#            → prisma db push → restart service → health check
#
# The build runs BEFORE the service is stopped, so a failed build leaves
# production untouched (the old release keeps serving).
#
# Usage:  DEPLOY_REF=<sha|branch> ./deploy/release-git.sh
#         ./deploy/release-git.sh                 # deploys current HEAD
#
# Env (with defaults):
#   SSH_KEY, SSH_HOST, SSH_PORT, APP_DIR, SERVICE_NAME, HEALTH_URL, DEPLOY_REF
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
SSH_HOST="${SSH_HOST:-Administrator@217.154.163.16}"
SSH_PORT="${SSH_PORT:-22}"
APP_DIR="${APP_DIR:-C:\\app}"
SAAS_DIR="${SAAS_DIR:-C:\\app\\saas}"
SERVICE_NAME="${SERVICE_NAME:-mse-saas}"
HEALTH_URL="${HEALTH_URL:-https://app.keyone1.com/api/ready}"
DEPLOY_REF="${DEPLOY_REF:-$(git -C "$ROOT_DIR" rev-parse HEAD)}"

echo "→ Deploy ref: $DEPLOY_REF"

# 1. Make sure the ref is on the remote so the VPS can fetch it.
echo "→ Pushing ref to origin…"
git -C "$ROOT_DIR" push origin "HEAD" 2>&1 | tail -3 || true

# 2. Build the remote PowerShell deploy script.
PS_SCRIPT=$(cat <<-'ENDSCRIPT'
$ErrorActionPreference = 'Stop'
Write-Host '→ Fetching latest…'
Set-Location '__SAAS_DIR__\..'
git fetch origin --prune --quiet
git reset --hard __REF__ --quiet
Write-Host ('   HEAD now: ' + (git rev-parse --short HEAD))

Set-Location '__SAAS_DIR__'
Write-Host '→ prisma generate…'
.\node_modules\.bin\prisma generate | Out-Null

# Build BEFORE stopping the service — a failed build leaves prod untouched.
Write-Host '→ next build (this is the long step)…'
$env:NODE_OPTIONS = '--max-old-space-size=4096'
npm run build
if ($LASTEXITCODE -ne 0) { throw 'BUILD FAILED — production left untouched.' }

Write-Host '→ prisma db push (additive schema)…'
.\node_modules\.bin\prisma db push --skip-generate --accept-data-loss

Write-Host '→ Restarting service…'
nssm stop '__SERVICE_NAME__'
Start-Sleep 2
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 1
nssm start '__SERVICE_NAME__'
Start-Sleep 6
$s = nssm status '__SERVICE_NAME__'
if ($s -ne 'SERVICE_RUNNING') { throw ("Service not running: " + $s) }
Write-Host 'DEPLOY_OK'
ENDSCRIPT
)
PS_SCRIPT=${PS_SCRIPT//__SAAS_DIR__/$SAAS_DIR}
PS_SCRIPT=${PS_SCRIPT//__SERVICE_NAME__/$SERVICE_NAME}
PS_SCRIPT=${PS_SCRIPT//__REF__/$DEPLOY_REF}

SCRIPT_PATH=$(mktemp)
echo "$PS_SCRIPT" > "$SCRIPT_PATH"

echo "→ Building on VPS & deploying…"
ssh -i "$SSH_KEY" -p "$SSH_PORT" -o StrictHostKeyChecking=accept-new "$SSH_HOST" powershell.exe -NoProfile -File - < "$SCRIPT_PATH"
rm -f "$SCRIPT_PATH"

# 3. Health check.
echo "→ Health check…"
sleep 4
code=$(curl -s -m 15 -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")
echo "   $HEALTH_URL → HTTP $code"
[ "$code" = "200" ] && echo "✅ Deploy complete & healthy" || { echo "⚠️ Health check non-200 ($code) — investigate"; exit 1; }
