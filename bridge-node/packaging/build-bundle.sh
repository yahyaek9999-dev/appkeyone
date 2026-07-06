#!/usr/bin/env bash
set -euo pipefail
# Assemble a SELF-CONTAINED KEYONE WA Bridge bundle for one OS/arch:
#   <bundle>/node(.exe)              — bundled Node runtime (no system Node needed)
#   <bundle>/app/keyone-wa-bridge.js — the bridge
#   <bundle>/app/node_modules        — production deps (whatsapp-web.js, ws, puppeteer-core)
#   <bundle>/run(.cmd)               — launcher (node app start)
#
# Chromium is NOT bundled — the installer detects system Chrome/Chromium, else the
# bridge/puppeteer downloads it on first run. Keeps the bundle ~90MB not ~250MB.
#
#   build-bundle.sh <darwin-arm64|darwin-x64|linux-x64|linux-arm64|win-x64> [nodeVersion]
NODE_VER="${2:-v20.18.1}"
TARGET="${1:?usage: build-bundle.sh <os-arch> [nodeVersion]}"
HERE="$(cd "$(dirname "$0")" && pwd)"        # bridge-node/packaging
SRC="$(cd "$HERE/.." && pwd)"                 # bridge-node
OUT="$HERE/dist/$TARGET"
export PATH="/usr/bin:/bin:/opt/homebrew/bin:$PATH"

case "$TARGET" in
  darwin-arm64) NDIR="node-$NODE_VER-darwin-arm64"; EXT="tar.gz"; NODEBIN="bin/node";  WIN=0 ;;
  darwin-x64)   NDIR="node-$NODE_VER-darwin-x64";   EXT="tar.gz"; NODEBIN="bin/node";  WIN=0 ;;
  linux-x64)    NDIR="node-$NODE_VER-linux-x64";    EXT="tar.xz"; NODEBIN="bin/node";  WIN=0 ;;
  linux-arm64)  NDIR="node-$NODE_VER-linux-arm64";  EXT="tar.xz"; NODEBIN="bin/node";  WIN=0 ;;
  win-x64)      NDIR="node-$NODE_VER-win-x64";      EXT="zip";    NODEBIN="node.exe";  WIN=1 ;;
  *) echo "unknown target $TARGET"; exit 1 ;;
esac

echo "▶ [$TARGET] fetch Node $NODE_VER"
rm -rf "$OUT"; mkdir -p "$OUT/app"
CACHE="$HERE/.nodecache"; mkdir -p "$CACHE"
ARCHIVE="$CACHE/$NDIR.$EXT"
[ -f "$ARCHIVE" ] || curl -fsSL "https://nodejs.org/dist/$NODE_VER/$NDIR.$EXT" -o "$ARCHIVE"
TMP="$(mktemp -d)"; ( cd "$TMP" && case "$EXT" in tar.gz) tar xzf "$ARCHIVE";; tar.xz) tar xJf "$ARCHIVE";; zip) unzip -q "$ARCHIVE";; esac )
cp "$TMP/$NDIR/$NODEBIN" "$OUT/$( [ "$WIN" = 1 ] && echo node.exe || echo node )"
[ "$WIN" = 0 ] && chmod +x "$OUT/node"
rm -rf "$TMP"

echo "▶ [$TARGET] vendor production node_modules"
cp "$SRC/package.json" "$OUT/app/package.json"
cp "$SRC/keyone-wa-bridge.js" "$OUT/app/keyone-wa-bridge.js"
( cd "$OUT/app" && PUPPETEER_SKIP_DOWNLOAD=true npm install --omit=dev --no-audit --no-fund --silent )

echo "▶ [$TARGET] launcher"
if [ "$WIN" = 1 ]; then
  printf '@echo off\r\n"%%~dp0node.exe" "%%~dp0app\\keyone-wa-bridge.js" %%*\r\n' > "$OUT/run.cmd"
else
  cat > "$OUT/run" <<'RUN'
#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/node" "$DIR/app/keyone-wa-bridge.js" "$@"
RUN
  chmod +x "$OUT/run"
fi

SIZE=$(du -sh "$OUT" | awk '{print $1}')
echo "✓ [$TARGET] bundle ready: $OUT ($SIZE)"
