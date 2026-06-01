#!/usr/bin/env bash
set -euo pipefail

echo "=== KEYONE Deploy ==="

# 1. Push to GitHub
cd "$(dirname "$0")"
git add -A
git commit -m "deploy: $(date -u '+%Y-%m-%d %H:%M UTC')" || true
git push origin main

# 2. SSH into VPS → pull + (stop) + build + restart
#    Order matters: STOP the service BEFORE `npm ci`, otherwise the running
#    app holds a lock on the Prisma query-engine DLL and `npm ci` fails with
#    EPERM. We also build via `npm run build` which uses the pinned LOCAL
#    Prisma (node_modules/.bin) — never a bare `npx prisma`, which can resolve
#    to a newer, incompatible Prisma and reject the schema.
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 powershell.exe -Command "
  \$ErrorActionPreference='Stop'
  Set-Location C:\app
  git fetch origin main
  git reset --hard origin/main

  # Stop the service first so node releases the Prisma DLL lock.
  nssm stop mse-saas
  Start-Sleep -Seconds 3
  Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 1

  Set-Location C:\app\saas
  npm ci
  # 'npm run build' runs 'prisma generate && next build' using the local,
  # version-pinned Prisma 5.22.0 — do NOT call 'npx prisma' here.
  npm run build

  nssm start mse-saas
  Start-Sleep -Seconds 6
  nssm status mse-saas
"

echo "=== Deploy complete ==="
