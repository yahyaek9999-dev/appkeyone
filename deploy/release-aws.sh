#!/usr/bin/env bash
set -euo pipefail
# ─────────────────────────────────────────────────────────────────────────────
# KEYONE AWS/Linux deploy — reproducible, commit-pinned, git-based.
#
# Replaces the retired Windows-VPS scripts (deploy/release.sh etc. target
# Administrator@217.154.163.16 / PowerShell / C:\app — that box is gone).
# The live production box is the AWS Linux host behind Caddy + systemd.
#
# What it does (idempotent):
#   1. Pins a commit (default HEAD); refuses if the tree is dirty.
#   2. Ships the saas/ Next app + bridge-gateway/ at that commit via rsync
#      (runtime dirs excluded: node_modules/.next/.env/*.db/uploads).
#   3. On the server: install deps → prisma generate + additive schema sync →
#      next build → gateway deps → restart services → stamp DEPLOYED_COMMIT.
#   4. Verifies /api/health + DEPLOYED_COMMIT after restart.
#
# The WhatsApp send pipeline is untouched; BRIDGE_ENABLED stays whatever the
# server .env says (OFF by default). This script never flips feature flags.
#
# Usage:
#   deploy/release-aws.sh [<commit-ish>]        # default HEAD
# Env overrides:
#   KEYONE_SSH_KEY   (default ~/Downloads/keyone.pem)
#   KEYONE_HOST      (default ubuntu@13.63.79.43)
#   KEYONE_URL       (default https://w.keyone1.com)
#   ALLOW_DIRTY=1    skip the clean-tree check (not recommended)
# ─────────────────────────────────────────────────────────────────────────────

COMMIT="${1:-HEAD}"
SSH_KEY="${KEYONE_SSH_KEY:-$HOME/Downloads/keyone.pem}"
HOST="${KEYONE_HOST:-ubuntu@13.63.79.43}"
URL="${KEYONE_URL:-https://w.keyone1.com}"
SSH=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=25)

command -v rsync >/dev/null || { echo "rsync required"; exit 1; }
[ -f "$SSH_KEY" ] || { echo "SSH key not found: $SSH_KEY"; exit 1; }

SHA="$(git rev-parse "$COMMIT")"
SHORT="$(git rev-parse --short "$COMMIT")"

if [ "${ALLOW_DIRTY:-0}" != "1" ] && ! git diff --quiet HEAD; then
  echo "✗ working tree is dirty — commit first (or ALLOW_DIRTY=1)"; exit 1
fi

echo "▶ Deploying $SHORT ($SHA) to $HOST"

# ---- 1. package the commit --------------------------------------------------
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git archive "$SHA" saas | tar -x -C "$TMP"
git archive "$SHA" bridge-gateway | tar -x -C "$TMP"
echo "$SHA" > "$TMP/DEPLOYED_COMMIT"

# ---- 2. ship source (runtime dirs excluded) ---------------------------------
RSYNC_SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new"
echo "▶ rsync saas/ → ~/keyone"
rsync -az --delete -e "$RSYNC_SSH" \
  --exclude 'node_modules' --exclude '.next' --exclude '.env' --exclude '.env.*' \
  --exclude '*.db' --exclude 'public/uploads' --exclude 'uploads' \
  "$TMP/saas/" "$HOST:keyone/"
echo "▶ rsync bridge-gateway/ → ~/bridge-gateway"
rsync -az --delete -e "$RSYNC_SSH" --exclude 'node_modules' \
  "$TMP/bridge-gateway/" "$HOST:bridge-gateway/"
scp -q -i "$SSH_KEY" "$TMP/DEPLOYED_COMMIT" "$HOST:keyone/DEPLOYED_COMMIT"

# ---- 3. build + migrate + restart on the server -----------------------------
echo "▶ remote build + migrate + restart"
"${SSH[@]}" "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
cd ~/keyone
echo "  · npm install (saas)"; npm install --no-audit --no-fund --silent >/tmp/deploy-npm.log 2>&1
set -a; . ./.env; set +a
echo "  · prisma generate"; ./node_modules/.bin/prisma generate --schema prisma/schema.postgres.prisma >/tmp/deploy-prisma.log 2>&1
# Additive schema sync. db push fails SAFE on any destructive change (no
# --accept-data-loss), so an accidental drop aborts the deploy instead of
# destroying data. Additive tables/columns apply cleanly.
echo "  · prisma db push (additive)"; ./node_modules/.bin/prisma db push --schema prisma/schema.postgres.prisma --skip-generate >>/tmp/deploy-prisma.log 2>&1
echo "  · next build"; npm run build >/tmp/deploy-build.log 2>&1
echo "  · gateway deps"; ( cd ~/bridge-gateway && npm install --omit=dev --no-audit --no-fund --silent >/tmp/deploy-gw.log 2>&1 )
echo "  · restart services"; sudo systemctl restart keyone.service keyone-bridge-gateway.service
sleep 2
systemctl is-active keyone.service keyone-bridge-gateway.service keyone-wa.service || true
echo "  · DEPLOYED_COMMIT=$(cat ~/keyone/DEPLOYED_COMMIT)"
REMOTE

# ---- 4. verify --------------------------------------------------------------
echo "▶ verify"
HEALTH="$(curl -s --max-time 20 "$URL/api/health" || true)"
echo "  health: $HEALTH"
REMOTE_SHA="$("${SSH[@]}" "$HOST" 'cat ~/keyone/DEPLOYED_COMMIT' 2>/dev/null || true)"
if [ "$REMOTE_SHA" = "$SHA" ] && echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo "✓ deployed $SHORT — server DEPLOYED_COMMIT matches, health ok"
else
  echo "✗ verification mismatch: remote=$REMOTE_SHA expected=$SHA"; exit 1
fi
