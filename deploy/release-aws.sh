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
#      out-of-place next build + atomic swap → gateway deps → restart
#      services → stamp DEPLOYED_COMMIT.
#   4. Verifies /api/health + DEPLOYED_COMMIT after restart.
#
# The WhatsApp send pipeline is untouched; BRIDGE_ENABLED stays whatever the
# server .env says (OFF by default). This script never flips feature flags.
#
# Usage:
#   deploy/release-aws.sh [<commit-ish>]        # default HEAD
# Env overrides:
#   KEYONE_SSH_KEY   (default ~/Downloads/1.pem)
#   KEYONE_HOST      (default ubuntu@16.171.230.84  — eu-north-1, Ubuntu 24.04)
#   KEYONE_URL       (default https://w.keyone1.com)
#   ALLOW_DIRTY=1    skip the clean-tree check (not recommended)
# ─────────────────────────────────────────────────────────────────────────────

COMMIT="${1:-HEAD}"
SSH_KEY="${KEYONE_SSH_KEY:-$HOME/Downloads/1.pem}"
HOST="${KEYONE_HOST:-ubuntu@16.171.230.84}"
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
"${SSH[@]}" "$HOST" "bash -s -- $SHORT" <<'REMOTE'
set -euo pipefail
SHORT="${1:-unknown}"
cd ~/keyone
# Stamp the build identity so /api/health reports the real deployed version
# instead of falling back to "dev" (health/route.ts reads BUILD_ID).
BUILD_ID="$SHORT-$(date -u +%Y%m%d)"
# Next inlines process.env.* into the server bundle at build time, so a
# runtime-only BUILD_ID folds to the "dev" fallback. NEXT_PUBLIC_BUILD_ID is
# guaranteed to be inlined from .env, so write both.
for k in BUILD_ID NEXT_PUBLIC_BUILD_ID; do
  if grep -q "^$k=" .env; then
    sed -i "s|^$k=.*|$k=$BUILD_ID|" .env
  else
    echo "$k=$BUILD_ID" >> .env
  fi
done
echo "  · BUILD_ID=$BUILD_ID"
echo "  · npm install (saas)"; npm install --no-audit --no-fund --silent >/tmp/deploy-npm.log 2>&1
set -a; . ./.env; set +a
echo "  · prisma generate"; ./node_modules/.bin/prisma generate --schema prisma/schema.postgres.prisma >/tmp/deploy-prisma.log 2>&1
# Additive schema sync. db push fails SAFE on any destructive change (no
# --accept-data-loss), so an accidental drop aborts the deploy instead of
# destroying data. Additive tables/columns apply cleanly.
echo "  · prisma db push (additive)"; ./node_modules/.bin/prisma db push --schema prisma/schema.postgres.prisma --skip-generate >>/tmp/deploy-prisma.log 2>&1
# Build OUT-OF-PLACE, then swap. `next build` used to write straight into the
# live .next while the running server was still serving from it; Next resolves
# route chunks lazily off disk, so replacing them under the live process made
# customer pages return 500 for the WHOLE build — minutes, on every release.
# Observed: /dashboard/products, /dashboard/leads and /dashboard/flow-builder
# all 500'd mid-deploy while /api/health still reported the OLD version and a
# multi-hour uptime, i.e. the process had not restarted — its files had been
# pulled out from under it.
#
# Now the live .next is not touched until the new build is complete AND
# verified, which also makes a failed build a true no-op instead of a
# backup/restore dance.
echo "  · next build (out-of-place → .next.new)"
rm -rf .next.new .next.old
# Seed the webpack/SWC cache from the live build. Next keeps it at
# <distDir>/cache, so building into a fresh directory would otherwise discard it
# and make EVERY deploy a cold build — which is exactly what happened on the
# first run of this change: the cold build exhausted V8's default heap and
# aborted ("Ineffective mark-compacts near heap limit"). Copying the cache
# restores incremental builds; the raised heap below covers the cold case
# (first deploy after this change, or a cache miss).
mkdir -p .next.new
cp -r .next/cache .next.new/cache 2>/dev/null || true
if ! NODE_OPTIONS="--max-old-space-size=4096" NEXT_DIST_DIR=.next.new npm run build >/tmp/deploy-build.log 2>&1; then
  echo "  ✗ build FAILED — live .next untouched, NOT restarting"; rm -rf .next.new
  tail -25 /tmp/deploy-build.log; exit 1
fi
# A complete build always writes a non-empty BUILD_ID and a server/ tree. Refuse
# to swap in a half-written directory (an OOM-killed build leaves one behind).
if [ ! -s .next.new/BUILD_ID ] || [ ! -d .next.new/server ]; then
  echo "  ✗ build output incomplete — live .next untouched, NOT restarting"; rm -rf .next.new
  tail -25 /tmp/deploy-build.log; exit 1
fi
echo "  · swap .next (live pages break only for the restart, not the build)"
mv .next .next.old 2>/dev/null || true
mv .next.new .next
echo "  · gateway deps"; ( cd ~/bridge-gateway && npm install --omit=dev --no-audit --no-fund --silent >/tmp/deploy-gw.log 2>&1 )
echo "  · restart services"
sudo systemctl restart keyone.service
# bridge gateway is optional / provisioned separately — restart only if present
systemctl list-unit-files | grep -q keyone-bridge-gateway.service && sudo systemctl restart keyone-bridge-gateway.service || true
sleep 2
systemctl is-active keyone.service keyone-bridge-gateway.service keyone-wa.service || true
rm -rf ~/keyone/.next.old
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
