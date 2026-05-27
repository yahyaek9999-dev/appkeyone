#!/usr/bin/env bash
set -euo pipefail

echo "=== KEYONE Deploy ==="

# 1. Push to GitHub
cd "$(dirname "$0")"
git add -A
git commit -m "deploy: $(date -u '+%Y-%m-%d %H:%M UTC')" || true
git push origin main

# 2. SSH into VPS → pull + build + restart
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 powershell.exe -Command "
  Set-Location C:\app
  git fetch origin main
  git reset --hard origin/main
  Set-Location C:\app\saas
  npm ci
  npx prisma generate
  npm run build
  nssm stop mse-saas
  nssm start mse-saas
"

echo "=== Deploy complete ==="
