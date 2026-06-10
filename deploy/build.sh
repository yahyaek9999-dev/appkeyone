#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# build.sh — Build locally & package deployable artifact
#
# Builds Next.js + Prisma locally and tars the result. The VPS never installs
# or builds — just extracts and restarts.
#
# Usage:  ./deploy/build.sh               # full build
#         ./deploy/build.sh --skip-build   # re-package existing build
#         ./deploy/build.sh --output foo.tar.gz
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SAAS_DIR="$ROOT_DIR/saas"
OUTPUT="release.tar.gz"
SKIP_BUILD=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=true; shift ;;
    --output) OUTPUT="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

cd "$SAAS_DIR"

# ── 1. Typecheck + Build ────────────────────────────────────────────────────
if [ "$SKIP_BUILD" != "true" ]; then
  echo "→ Typecheck…"
  ./node_modules/.bin/tsc --noEmit

  echo "→ Prisma generate…"
  ./node_modules/.bin/prisma generate

  echo "→ Next.js build…"
  npm run build
fi

# ── 2. Prune dev deps ───────────────────────────────────────────────────────
echo "→ Prune dev dependencies…"
npm prune --production

# ── 3. Build info ───────────────────────────────────────────────────────────
HASH="$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")"
DATE="$(date -u '+%Y%m%d-%H%M%S')"
RELEASE="keyone-${HASH}-${DATE}"
TMP="$(mktemp -d)"
DIR="$TMP/$RELEASE"

mkdir -p "$DIR/.next" "$DIR/public" "$DIR/prisma" "$DIR/workers"

# ── 4. Copy runtime files ───────────────────────────────────────────────────
# Ship ONLY production runtime files. Build-only caches (.next/cache — typically
# ~1GB of webpack/swc cache), dev databases, logs and temp files are NEVER
# needed at runtime and are excluded to minimize transfer size.
echo "→ Packaging (excluding .next/cache, dev db, logs, temp)…"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --exclude='cache/' --exclude='*.log' --exclude='*.tmp' --exclude='*.temp' --exclude='.DS_Store' .next/ "$DIR/.next/"
  rsync -a --exclude='*.db' --exclude='*.db-journal' --exclude='*.db-wal' --exclude='*.db-shm' prisma/ "$DIR/prisma/"
else
  ( cd .next && find . -mindepth 1 -maxdepth 1 ! -name cache -exec cp -r {} "$DIR/.next/" \; )
  ( cd prisma && find . -mindepth 1 -maxdepth 1 ! -name '*.db' ! -name '*.db-journal' -exec cp -r {} "$DIR/prisma/" \; )
fi
cp -r public/* "$DIR/public/"
cp -r node_modules "$DIR/"
cp package.json next.config.js "$DIR/" 2>/dev/null || true

# Workers
[ -d workers ] && cp -r workers/* "$DIR/workers/" 2>/dev/null || true

# Build metadata
cat > "$DIR/.build-info" <<-EOF
RELEASE=$RELEASE
HASH=$HASH
DATE=$DATE
NODE=$(node -v)
EOF

# ── 5. Archive ──────────────────────────────────────────────────────────────
cd "$TMP"
tar czf "$ROOT_DIR/$OUTPUT" "$RELEASE"
cd "$ROOT_DIR"
rm -rf "$TMP"

# ── 6. Restore dev deps ─────────────────────────────────────────────────────
echo "→ Restoring dev dependencies…"
cd "$SAAS_DIR"
npm ci 2>/dev/null || npm install

echo "─────────────────────────────────────────"
echo " Artifact: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
echo " Release:  $RELEASE"
echo "─────────────────────────────────────────"
