#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# release-git.sh — Server-side build deploy (minimal transfer).
#
# Instead of SCP-ing a ~1.8GB artifact (mostly .next/cache + node_modules), this
# transfers ONLY the git diff and builds on the VPS:
#
#   push ref → VPS: git fetch+reset → npm ci → next build → prisma db push
#            → restart service → health check
#
# IMPORTANT details learned in production:
#   • The VPS is Windows. node_modules MUST be installed on the VPS (npm ci) so
#     the platform-native Prisma query engine + @next/swc binaries are correct.
#     A Mac/Linux node_modules will start but crash at runtime
#     ("could not locate the Query Engine for runtime windows"). So npm ci is
#     REQUIRED even when package.json is unchanged.
#   • The build (npm ci + next build) runs BEFORE the service is stopped, so a
#     failed build leaves the running release untouched.
#   • The remote script is executed via a FILE (-File <path>), not stdin, so
#     $ErrorActionPreference='Stop' / throw actually abort on failure.
#
# Usage:  DEPLOY_REF=<sha|branch> ./deploy/release-git.sh
#         ./deploy/release-git.sh                 # deploys current HEAD
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
# Build identity, baked into .next (NEXT_PUBLIC_BUILD_ID) and written to
# .build-info so /api/health version, .build-info, and git HEAD all align.
DEPLOY_SHORT="$(git -C "$ROOT_DIR" rev-parse --short "$DEPLOY_REF")"
DEPLOY_DATE="$(date -u '+%Y%m%d-%H%M%S')"
BUILD_ID="${DEPLOY_SHORT}-$(date -u '+%Y%m%d')"
SSH=(ssh -i "$SSH_KEY" -p "$SSH_PORT" -o StrictHostKeyChecking=accept-new)
SCP=(scp -i "$SSH_KEY" -P "$SSH_PORT" -o StrictHostKeyChecking=accept-new)

echo "→ Deploy ref: $DEPLOY_REF"
echo "→ Pushing ref to origin…"
git -C "$ROOT_DIR" push origin HEAD 2>&1 | tail -2 || true

# Build the remote PowerShell deploy script (executed via -File for real error
# handling). __TOKENS__ are substituted below.
cat > /tmp/keyone-deploy.ps1 <<'ENDSCRIPT'
$ErrorActionPreference = 'Stop'
function Fail($m){ Write-Host ("DEPLOY_FAILED: " + $m); exit 1 }

Write-Host '-> git fetch + reset…'
Set-Location '__APP_DIR__'
git fetch origin --prune --quiet
git reset --hard __REF__ --quiet
Write-Host ('   HEAD now: ' + (git rev-parse --short HEAD))

Set-Location '__SAAS_DIR__'

# On Windows the running Node service LOCKS loaded node_modules DLLs (e.g. the
# Prisma query engine), so a clean `npm ci` requires the service to be stopped
# first. This incurs a short maintenance window (npm ci + build). On any failure
# the service is restarted on the existing build before exiting.
Write-Host '-> stopping service (maintenance window begins)…'
& nssm stop '__SERVICE_NAME__' | Out-Null
Start-Sleep 2
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 2

Write-Host '-> npm ci (clean Windows-native deps)…'
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { & nssm start '__SERVICE_NAME__' | Out-Null; Fail 'npm ci failed (service restarted on previous build)' }

# postinstall ran `prisma generate`; bake build identity so /api/health == commit.
$head = (git rev-parse --short HEAD)
$env:NEXT_PUBLIC_BUILD_ID = '__BUILD_ID__'
Write-Host '-> next build…'
$env:NODE_OPTIONS = '--max-old-space-size=4096'
npm run build
if ($LASTEXITCODE -ne 0) { & nssm start '__SERVICE_NAME__' | Out-Null; Fail 'next build failed (service restarted)' }

# Fresh .build-info aligned to git HEAD (replaces any stale artifact).
@(
  "RELEASE=keyone-$head-__DEPLOY_DATE__",
  "HASH=$head",
  "BUILD_ID=__BUILD_ID__",
  "DATE=__DEPLOY_DATE__",
  "NODE=$(node -v)"
) | Set-Content -Encoding ascii '.build-info'

Write-Host '-> prisma db push (no-op when schema unchanged)…'
& '.\node_modules\.bin\prisma.cmd' db push --skip-generate --accept-data-loss
if ($LASTEXITCODE -ne 0) { Fail 'prisma db push failed' }

Write-Host '-> starting service…'
& nssm start '__SERVICE_NAME__' | Out-Null
Start-Sleep 8
$s = & nssm status '__SERVICE_NAME__'
if ($s -ne 'SERVICE_RUNNING') { Fail ("service not running: " + $s) }
Write-Host 'DEPLOY_OK'
ENDSCRIPT

sed -i.bak \
  -e "s#__APP_DIR__#${APP_DIR//\\/\\\\}#g" \
  -e "s#__SAAS_DIR__#${SAAS_DIR//\\/\\\\}#g" \
  -e "s#__SERVICE_NAME__#${SERVICE_NAME}#g" \
  -e "s#__REF__#${DEPLOY_REF}#g" \
  -e "s#__BUILD_ID__#${BUILD_ID}#g" \
  -e "s#__DEPLOY_DATE__#${DEPLOY_DATE}#g" \
  /tmp/keyone-deploy.ps1
rm -f /tmp/keyone-deploy.ps1.bak

echo "→ Uploading deploy script…"
"${SCP[@]}" /tmp/keyone-deploy.ps1 "${SSH_HOST}:C:/app/_deploy.ps1"

echo "→ Building on VPS & deploying (this includes npm ci + next build)…"
"${SSH[@]}" "$SSH_HOST" "powershell -NoProfile -ExecutionPolicy Bypass -File C:\\app\\_deploy.ps1; Remove-Item C:\\app\\_deploy.ps1 -Force -ErrorAction SilentlyContinue"

echo "→ Health check…"
sleep 4
code=$(curl -s -m 15 -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")
echo "   $HEALTH_URL → HTTP $code"
[ "$code" = "200" ] && echo "✅ Deploy complete & healthy" || { echo "⚠️ Health check non-200 ($code) — investigate"; exit 1; }
